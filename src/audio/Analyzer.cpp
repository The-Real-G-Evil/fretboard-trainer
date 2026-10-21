#include "audio/Analyzer.h"

#include <algorithm>

namespace ft
{

void Analyzer::prepare (const Config& config)
{
    cfg = config;

    PitchDetector::Config pc;
    pc.sampleRate = cfg.sampleRate;
    pc.minHz = cfg.minHz;
    pc.maxHz = cfg.maxHz;
    pitch.prepare (pc);

    OnsetDetector::Config oc;
    oc.sampleRate = cfg.sampleRate;
    onset.prepare (oc);

    tracker.reset();

    hopSize = onset.getHopSize();
    frameSize = pitch.getFrameSize();
    historySize = std::max (frameSize, onset.getWindowSize());
    history.assign (static_cast<size_t> (historySize), 0.0f);
    hopFill = 0;
    hopGateOpen = false;
    totalSamples = 0;
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
    const auto sr = cfg.sampleRate;
    const auto endSec = static_cast<double> (totalSamples) / sr;

    const auto* onsetWindow = history.data() + (historySize - onset.getWindowSize());
    if (const auto o = onset.processHop (onsetWindow, totalSamples, gateOpen))
    {
        const auto t = static_cast<double> (*o) / sr;
        out.onsets.push_back (t);
        tracker.onOnset (t);
    }

    PitchFrame pf;
    pf.timeSec = endSec;

    if (gateOpen)
        pf.pitch = pitch.detect (history.data() + (historySize - frameSize));

    out.pitches.push_back (pf);

    NoteTracker::Frame f;
    f.frameStartSec = static_cast<double> (totalSamples - frameSize) / sr;
    f.frameEndSec = endSec;
    f.hz = pf.pitch.hz;
    f.voiced = pf.pitch.voiced;

    if (const auto ev = tracker.onFrame (f))
        out.notes.push_back (*ev);
}

} // namespace ft
