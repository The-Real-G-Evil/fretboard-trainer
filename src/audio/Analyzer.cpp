#include "audio/Analyzer.h"

#include "audio/MusicMath.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace ft
{

OnsetDetector::Config Analyzer::onsetConfig (const Config& c)
{
    OnsetDetector::Config oc;
    oc.sampleRate = c.sampleRate;
    oc.minRiseDb = c.tuning.minRiseDb;
    oc.fluxMultiplier = c.tuning.fluxMultiplier;
    oc.strongFluxFactor = c.tuning.strongFluxFactor;
    return oc;
}

NoteTracker::Config Analyzer::trackerConfig (const Config& c)
{
    NoteTracker::Config tc;
    tc.stableFrames = std::max (1, c.tuning.stableFrames);
    tc.legatoFrames = std::max (1, c.tuning.legatoFrames);
    return tc;
}

void Analyzer::prepare (const Config& config)
{
    cfg = config;

    PitchDetector::Config pc;
    pc.sampleRate = cfg.sampleRate;
    pc.minHz = cfg.minHz;
    pc.maxHz = cfg.maxHz;
    pitch.prepare (pc);

    onset.prepare (onsetConfig (cfg));

    tracker.setConfig (trackerConfig (cfg));
    tracker.reset();

    hopSize = onset.getHopSize();
    frameSize = pitch.getFrameSize();
    // Etwas mehr Verlauf, damit beim Erkennen eines Anschlags das Fenster davor noch vorliegt
    historySize = std::max (frameSize, onset.getWindowSize()) + 3 * hopSize;
    history.assign (static_cast<size_t> (historySize), 0.0f);
    hann.resize (static_cast<size_t> (frameSize));
    for (int i = 0; i < frameSize; ++i)
        hann[static_cast<size_t> (i)] = static_cast<float> (0.5 - 0.5 * std::cos (2.0 * std::numbers::pi * i / frameSize));
    preOnset.assign (static_cast<size_t> (frameSize), 0.0f);
    havePreOnset = false;
    hopFill = 0;
    hopGateOpen = false;
    totalSamples = 0;
    recording = nullptr;
}

void Analyzer::setRecording (Recording* rec)
{
    recording = rec;

    if (recording != nullptr)
    {
        recording->config = cfg;
        recording->frameSize = frameSize;
    }
}

void Analyzer::process (const float* samples, int numSamples, bool gateOpen, Output& out)
{
    int pos = 0;

    while (pos < numSamples)
    {
        const auto n = std::min (numSamples - pos, hopSize - hopFill);

        // Neue Samples hinten an den Verlauf haengen (vorher Platz schaffen)
        std::copy (history.begin() + n, history.end(), history.begin());
        std::copy (samples + pos, samples + pos + n, history.end() - n);

        hopFill += n;
        pos += n;
        totalSamples += n;
        hopGateOpen = hopGateOpen || gateOpen;

        if (hopFill == hopSize)
        {
            processHop (hopGateOpen, out);
            hopFill = 0;
            hopGateOpen = false;
        }
    }
}

void Analyzer::processHop (bool gateOpen, Output& out)
{
    HopRecord hop;
    hop.onset = onset.analyseHop (history.data() + (historySize - onset.getWindowSize()), totalSamples, gateOpen);

    if (gateOpen)
        hop.pitch = pitch.detect (history.data() + (historySize - frameSize));

    if (recording != nullptr)
        recording->hops.push_back (hop);

    const auto before = out.notes.size();
    const auto onsetsBefore = out.onsets.size();
    decideHop (hop, cfg.sampleRate, frameSize, onset, tracker, out, true);

    // Fenster direkt vor dem Anschlag merken (fuer den Vergleich "neue Teiltoene")
    if (out.onsets.size() > onsetsBefore)
    {
        const auto onsetSample = static_cast<long long> (std::llround (out.onsets.back() * cfg.sampleRate));
        const auto endIndex = historySize - static_cast<int> (totalSamples - onsetSample);
        const auto startIndex = endIndex - frameSize;
        std::fill (preOnset.begin(), preOnset.end(), 0.0f);
        for (int i = std::max (0, startIndex); i < endIndex && i < historySize; ++i)
            preOnset[static_cast<size_t> (i - startIndex)] = history[static_cast<size_t> (i)];
        havePreOnset = endIndex > 0;
    }

    if (! expected.empty())
        for (auto i = before; i < out.notes.size(); ++i)
            correctWithExpected (out.notes[i]);
}

double Analyzer::magnitudeIn (const float* x, int n, const float* window, double hz, double sampleRate) noexcept
{
    const auto w = 2.0 * std::numbers::pi * hz / sampleRate;
    const auto coeff = 2.0 * std::cos (w);
    double s1 = 0.0, s2 = 0.0;

    for (int i = 0; i < n; ++i)
    {
        const auto s0 = x[i] * window[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }

    return std::sqrt (std::max (0.0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
}

std::pair<double, double> Analyzer::newPartialEnergy (double f0, double sharedWithF0) const noexcept
{
    if (! havePreOnset)
        return { 0.0, 0.0 };

    const auto* now = history.data() + (historySize - frameSize);
    double fresh = 0.0, total = 0.0;

    auto shared = [sharedWithF0] (double hz)
    {
        if (sharedWithF0 <= 0.0)
            return false;
        const auto k = std::round (hz / sharedWithF0);
        return k >= 1.0 && std::abs (hz - k * sharedWithF0) < 0.03 * hz;
    };

    for (int h = 1; h <= 4; ++h)
    {
        const auto hz = f0 * h;
        if (hz >= cfg.sampleRate * 0.45)
            break;
        if (shared (hz))
            continue;
        const auto mNow = magnitudeIn (now, frameSize, hann.data(), hz, cfg.sampleRate);
        const auto mPre = magnitudeIn (preOnset.data(), frameSize, hann.data(), hz, cfg.sampleRate);
        fresh += std::max (0.0, mNow - mPre) / h;
        total += mNow / h;
    }

    return { fresh, total };
}

double Analyzer::magnitudeAt (double hz) const noexcept
{
    return magnitudeIn (history.data() + (historySize - frameSize), frameSize, hann.data(), hz, cfg.sampleRate);
}

void Analyzer::correctWithExpected (NoteEvent& ev) const noexcept
{
    for (const auto e : expected)
        if (ev.midi == e)
            return; // erwarteter Ton erkannt

    for (const auto e : expected)
    {
        const auto diff = ev.midi - e;

        // 1. Beim Anschlag: Teiltoene, die nur der erkannte Ton hat (nicht der erwartete), muessen
        //    neu entstanden sein – sonst stammt der erkannte Ton von einer mit- oder nachklingenden
        //    Saite bzw. ist ein Teiltonfehler, und gespielt wurde der erwartete Ton.
        if (ev.onsetType == OnsetType::pick)
        {
            const auto expectedHz = midiToHz (e);
            const auto detectedHz = midiToHz (ev.midi + ev.cents / 100.0);
            const auto [freshExpected, totalExpected] = newPartialEnergy (expectedHz);

            // Eine Oktave hoeher erkannt: alle Teiltoene des erkannten Tons gehoeren auch zum
            // erwarteten – dann muessen umgekehrt die eigenen (ungeraden) Teiltoene des erwarteten
            // Tons neu sein. Tiefer erkannt bzw. anderer Ton: die eigenen Teiltoene des erkannten
            // Tons duerfen nicht neu sein.
            const bool detectedHasOwn = ! (diff > 0 && diff % 12 == 0);
            const bool expectedHasOwn = ! (diff < 0 && diff % 12 == 0);
            const auto freshOnlyDetected = detectedHasOwn ? newPartialEnergy (detectedHz, expectedHz).first : 0.0;
            const auto freshOnlyExpected = expectedHasOwn ? newPartialEnergy (expectedHz, detectedHz).first : freshExpected;

            if (freshExpected > 0.0 && freshExpected >= 0.3 * totalExpected
                && freshOnlyDetected <= 0.5 * freshExpected
                && freshOnlyExpected >= 0.25 * freshExpected)
            {
                ev.cents = diff % 12 == 0 ? ev.cents : 0.0f; // bei fremdem Ton sagt dessen Abweichung nichts
                ev.midi = e;
                ev.corrected = true;
                return;
            }
        }

        // 2. Oktave (auch ohne Anschlag): Grundton-Vergleich im aktuellen Fenster
        if (diff % 12 != 0)
            continue;

        const auto expectedHz = midiToHz (e + ev.cents / 100.0);
        const auto detectedHz = midiToHz (ev.midi + ev.cents / 100.0);
        const auto mExpected = magnitudeAt (expectedHz);
        const auto mDetected = magnitudeAt (detectedHz);

        // Zu tief erkannt: der tiefere Ton darf praktisch nicht im Spektrum vorkommen.
        // Zu hoch erkannt: der Grundton des erwarteten Tons muss deutlich vorhanden sein.
        const bool plausible = diff < 0 ? mExpected >= 4.0 * mDetected
                                        : mExpected >= 0.25 * mDetected;
        if (plausible)
        {
            ev.midi = e;
            ev.corrected = true;
            return;
        }
    }
}

void Analyzer::decideHop (const HopRecord& hop, double sr, int frameSize,
                          OnsetDetector& onset, NoteTracker& tracker, Output& out, bool withPitchFrame)
{
    const auto end = hop.onset.windowEndSample;
    const auto endSec = static_cast<double> (end) / sr;

    if (const auto o = onset.decide (hop.onset))
    {
        const auto t = static_cast<double> (*o) / sr;
        out.onsets.push_back (t);
        tracker.onOnset (t);
    }

    if (withPitchFrame)
        out.pitches.push_back ({ endSec, hop.pitch });

    NoteTracker::Frame f;
    f.frameStartSec = static_cast<double> (end - frameSize) / sr;
    f.frameEndSec = endSec;
    f.hz = hop.pitch.hz;
    f.voiced = hop.pitch.voiced;
    f.levelDb = hop.onset.envelopeDb;

    if (const auto ev = tracker.onFrame (f))
        out.notes.push_back (*ev);
}

Analyzer::Output Analyzer::replay (const Recording& rec, const DetectionTuning& tuning)
{
    auto c = rec.config;
    c.tuning = tuning;

    // Entscheidungsparameter wirken nur in decide(); die Merkmale stammen aus der Aufzeichnung
    OnsetDetector onset;
    onset.prepare (onsetConfig (c));

    NoteTracker tracker;
    tracker.setConfig (trackerConfig (c));

    Output out;
    for (const auto& hop : rec.hops)
        decideHop (hop, c.sampleRate, rec.frameSize, onset, tracker, out, false);

    return out;
}

} // namespace ft
