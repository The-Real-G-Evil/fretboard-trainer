#include "audio/PitchDetector.h"
#include "audio/LevelMeter.h"

#include <algorithm>
#include <cmath>

namespace ft
{

void PitchDetector::prepare (const Config& config)
{
    cfg = config;
    cfg.minHz = std::max (10.0f, cfg.minHz);
    cfg.maxHz = std::max (cfg.minHz * 2.0f, cfg.maxHz);

    minLag = std::max (2, static_cast<int> (std::floor (cfg.sampleRate / cfg.maxHz)));
    maxLag = static_cast<int> (std::ceil (cfg.sampleRate / cfg.minHz));

    frameSize = std::max (1024, Fft::nextPowerOfTwo (2 * (maxLag + 2)));
    window = frameSize / 2;

    fft.prepare (frameSize);
    spectrumFrame.assign (static_cast<size_t> (frameSize), {});
    spectrumWindow.assign (static_cast<size_t> (frameSize), {});
    prefixEnergy.assign (static_cast<size_t> (frameSize + 1), 0.0);
    cmnd.assign (static_cast<size_t> (maxLag + 2), 1.0f);
}

PitchDetector::Result PitchDetector::detect (const float* x) noexcept
{
    Result result;

    // Energie-Praefixsummen fuer die Fensterenergien e(tau) = sum_{j=tau}^{tau+W-1} x_j^2
    prefixEnergy[0] = 0.0;
    for (int i = 0; i < frameSize; ++i)
        prefixEnergy[static_cast<size_t> (i + 1)] = prefixEnergy[static_cast<size_t> (i)] + static_cast<double> (x[i]) * x[i];

    const auto rms = std::sqrt (prefixEnergy[static_cast<size_t> (frameSize)] / frameSize);
    if (gainToDb (static_cast<float> (rms)) < cfg.silenceDb)
        return result;

    // Kreuzkorrelation c(tau) = sum_{j<W} x_j x_{j+tau} per FFT (kein Umlauf fuer tau <= W)
    for (int i = 0; i < frameSize; ++i)
    {
        spectrumFrame[static_cast<size_t> (i)]  = { x[i], 0.0f };
        spectrumWindow[static_cast<size_t> (i)] = { i < window ? x[i] : 0.0f, 0.0f };
    }

    fft.forward (spectrumFrame.data());
    fft.forward (spectrumWindow.data());

    for (int i = 0; i < frameSize; ++i)
        spectrumFrame[static_cast<size_t> (i)] *= std::conj (spectrumWindow[static_cast<size_t> (i)]);

    fft.inverse (spectrumFrame.data());

    // Differenzfunktion und kumulativ normierte Differenz (CMND)
    const auto e0 = prefixEnergy[static_cast<size_t> (window)];
    double runningSum = 0.0;
    cmnd[0] = 1.0f;

    for (int tau = 1; tau <= maxLag + 1; ++tau)
    {
        const auto etau = prefixEnergy[static_cast<size_t> (tau + window)] - prefixEnergy[static_cast<size_t> (tau)];
        const auto d = std::max (0.0, e0 + etau - 2.0 * spectrumFrame[static_cast<size_t> (tau)].real());
        runningSum += d;
        cmnd[static_cast<size_t> (tau)] = runningSum > 0.0 ? static_cast<float> (d * tau / runningSum) : 1.0f;
    }

    // Erste Senke unter der Schwelle, dann bis zum lokalen Minimum absteigen
    int best = -1;
    for (int tau = minLag; tau <= maxLag; ++tau)
    {
        if (cmnd[static_cast<size_t> (tau)] < cfg.threshold)
        {
            while (tau + 1 <= maxLag && cmnd[static_cast<size_t> (tau + 1)] < cmnd[static_cast<size_t> (tau)])
                ++tau;
            best = tau;
            break;
        }
    }

    if (best < 0)
    {
        best = minLag;
        for (int tau = minLag + 1; tau <= maxLag; ++tau)
            if (cmnd[static_cast<size_t> (tau)] < cmnd[static_cast<size_t> (best)])
                best = tau;
    }

    // Parabolische Interpolation fuer Sub-Sample-Genauigkeit
    double period = best;
    {
        const auto a = cmnd[static_cast<size_t> (best - 1)];
        const auto b = cmnd[static_cast<size_t> (best)];
        const auto c = cmnd[static_cast<size_t> (best + 1)];
        const auto denom = a - 2.0f * b + c;
        if (denom > 0.0f)
            period += std::clamp (0.5 * (a - c) / denom, -1.0, 1.0);
    }

    const auto value = cmnd[static_cast<size_t> (best)];
    result.hz = static_cast<float> (cfg.sampleRate / period);
    result.confidence = std::clamp (1.0f - value, 0.0f, 1.0f);
    result.voiced = value <= cfg.voicedLimit && result.hz >= cfg.minHz * 0.97f && result.hz <= cfg.maxHz * 1.03f;
    return result;
}

} // namespace ft
