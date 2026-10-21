#pragma once

#include "audio/Analyzer.h"
#include "audio/NoiseGate.h"

#include <algorithm>
#include <vector>

namespace ft::test
{

struct EmittedNote
{
    NoteEvent event;
    double emittedAtSec = 0.0; ///< Zeitpunkt, zu dem der Analyzer die Note gemeldet hat
};

struct AnalysisRun
{
    std::vector<EmittedNote> notes;
    std::vector<double> onsets;
    std::vector<Analyzer::PitchFrame> pitches;
};

/** Laesst das Signal wie in der App blockweise durch Noisegate und Analyzer laufen. */
inline AnalysisRun analyse (const std::vector<float>& signal, double sampleRate,
                            float minHz = 55.0f, float maxHz = 1500.0f, int blockSize = 128,
                            float gateThresholdDb = -50.0f)
{
    Analyzer analyzer;
    analyzer.prepare ({ sampleRate, minHz, maxHz });

    NoiseGate gate;
    gate.prepare (sampleRate);
    NoiseGate::Parameters gp;
    gp.thresholdDb = gateThresholdDb;
    gate.setParameters (gp);

    AnalysisRun run;
    Analyzer::Output out;
    std::vector<float> gated (static_cast<size_t> (blockSize));

    for (size_t pos = 0; pos < signal.size(); pos += static_cast<size_t> (blockSize))
    {
        const auto n = static_cast<int> (std::min<size_t> (static_cast<size_t> (blockSize), signal.size() - pos));
        std::copy (signal.begin() + static_cast<std::ptrdiff_t> (pos), signal.begin() + static_cast<std::ptrdiff_t> (pos) + n, gated.begin());
        gate.process (gated.data(), n);

        out.clear();
        analyzer.process (signal.data() + pos, n, gate.isOpen(), out);

        const auto now = static_cast<double> (pos + static_cast<size_t> (n)) / sampleRate;
        for (const auto& ev : out.notes)
            run.notes.push_back ({ ev, now });
        run.onsets.insert (run.onsets.end(), out.onsets.begin(), out.onsets.end());
        run.pitches.insert (run.pitches.end(), out.pitches.begin(), out.pitches.end());
    }

    return run;
}

} // namespace ft::test
