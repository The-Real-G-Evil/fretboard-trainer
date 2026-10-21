#include "audio/OnsetDetector.h"
#include "audio/LevelMeter.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace ft
{

namespace
{
    constexpr double envelopeReleaseMs = 30.0;
    constexpr int baselineSkipHops = 2;  ///< Huellkurven-Vergleich mit Hops t-2 .. t-6
    constexpr int baselineHops = 5;
}

void OnsetDetector::prepare (const Config& config)
{
    cfg = config;

    // ~5 ms Hop, 4 Hops Fenster (48 kHz: 256 / 1024)
    hopSize = Fft::nextPowerOfTwo (static_cast<int> (cfg.sampleRate * 0.004));
    windowSize = hopSize * 4;
    numBins = windowSize / 2 + 1;

    fft.prepare (windowSize);
    spectrum.assign (static_cast<size_t> (windowSize), {});
    prevMagnitude.assign (static_cast<size_t> (numBins), 0.0f);
    blockEnergy.assign (static_cast<size_t> (windowSize / refineBlock), 0.0);

    hann.resize (static_cast<size_t> (windowSize));
    for (int i = 0; i < windowSize; ++i)
        hann[static_cast<size_t> (i)] = static_cast<float> (0.5 - 0.5 * std::cos (2.0 * std::numbers::pi * i / windowSize));

    envelopeDecay = static_cast<float> (std::exp (-1.0 / (envelopeReleaseMs * 0.001 * cfg.sampleRate)));

    reset();
}

void OnsetDetector::reset()
{
    std::fill (prevMagnitude.begin(), prevMagnitude.end(), 0.0f);
    fluxHistory.fill (0.0f);
    envelopeHistory.fill (0.0f);
    envelope = 0.0f;
    historyFill = 0;
    lastOnset = -1'000'000'000;
    lastFlux = lastFluxThreshold = lastRiseDb = 0.0f;
}

std::optional<long long> OnsetDetector::processHop (const float* window, long long windowEndSample, bool gateOpen) noexcept
{
    // Huellkurve (Spitzenwertfolger) ueber den neuesten Hop fortschreiben
    for (int i = windowSize - hopSize; i < windowSize; ++i)
        envelope = std::max (std::abs (window[i]), envelope * envelopeDecay);

    // Spektraler Fluss mit log-Kompression, normiert auf die Bin-Anzahl
    for (int i = 0; i < windowSize; ++i)
        spectrum[static_cast<size_t> (i)] = { window[i] * hann[static_cast<size_t> (i)], 0.0f };

    fft.forward (spectrum.data());

    double flux = 0.0;
    for (int k = 0; k < numBins; ++k)
    {
        const auto mag = std::log1p (100.0f * std::abs (spectrum[static_cast<size_t> (k)]));
        flux += std::max (0.0f, mag - prevMagnitude[static_cast<size_t> (k)]);
        prevMagnitude[static_cast<size_t> (k)] = mag;
    }
    lastFlux = static_cast<float> (flux / numBins);

    // Vergleichswerte aus der Historie (Index 0 = vorheriger Hop)
    float baseline = 0.0f;
    for (int i = baselineSkipHops - 1; i < baselineSkipHops - 1 + baselineHops; ++i)
        baseline = std::max (baseline, envelopeHistory[static_cast<size_t> (i)]);

    float meanFlux = 0.0f;
    for (int i = 0; i < historyFill; ++i)
        meanFlux += fluxHistory[static_cast<size_t> (i)];
    meanFlux = historyFill > 0 ? meanFlux / static_cast<float> (historyFill) : 0.0f;

    const bool warm = historyFill >= 4;

    std::copy_backward (envelopeHistory.begin(), envelopeHistory.end() - 1, envelopeHistory.end());
    std::copy_backward (fluxHistory.begin(), fluxHistory.end() - 1, fluxHistory.end());
    envelopeHistory[0] = envelope;
    fluxHistory[0] = lastFlux;
    historyFill = std::min (historyFill + 1, historyHops);

    lastRiseDb = gainToDb (envelope) - gainToDb (std::max (baseline, 1e-6f));
    lastFluxThreshold = cfg.fluxMultiplier * meanFlux + cfg.fluxDelta;

    if (! warm || ! gateOpen)
        return std::nullopt;

    const auto minInterval = static_cast<long long> (cfg.minIntervalMs * 0.001 * cfg.sampleRate);
    const bool fluxOk = lastFlux > lastFluxThreshold;
    const bool strong = lastFlux > cfg.strongFluxFactor * lastFluxThreshold;

    if (! fluxOk
        || ! (strong || lastRiseDb >= cfg.minRiseDb)
        || gainToDb (envelope) < cfg.silenceDb
        || windowEndSample - lastOnset < minInterval)
        return std::nullopt;

    const auto onset = refineOnset (window, windowEndSample);

    if (onset - lastOnset < minInterval)
        return std::nullopt;

    lastOnset = onset;
    return onset;
}

long long OnsetDetector::refineOnset (const float* window, long long windowEndSample) noexcept
{
    // Blockenergien der ersten Differenz (Hochpass: betont den breitbandigen Anschlagsklick
    // gegenueber dem klingenden Ton) ueber das ganze Fenster; in den letzten zwei Hops den
    // Block mit dem groessten Anstieg gegenueber dem Maximum der vorangehenden 16 Bloecke.
    const int numBlocks = windowSize / refineBlock;

    for (int b = 0; b < numBlocks; ++b)
    {
        double e = 0.0;
        for (int i = std::max (1, b * refineBlock); i < (b + 1) * refineBlock; ++i)
        {
            const auto d = static_cast<double> (window[i]) - window[i - 1];
            e += d * d;
        }
        blockEnergy[static_cast<size_t> (b)] = e;
    }

    const int firstCandidate = (windowSize - 2 * hopSize) / refineBlock;
    const int lookBack = std::min (16, firstCandidate);
    int best = firstCandidate;
    double bestRatio = 0.0;

    for (int b = firstCandidate; b < numBlocks; ++b)
    {
        double before = 1e-12;
        for (int j = b - lookBack; j < b; ++j)
            before = std::max (before, blockEnergy[static_cast<size_t> (j)]);

        const auto ratio = blockEnergy[static_cast<size_t> (b)] / before;
        if (ratio > bestRatio)
        {
            bestRatio = ratio;
            best = b;
        }
    }

    return windowEndSample - windowSize + static_cast<long long> (best) * refineBlock;
}

} // namespace ft
