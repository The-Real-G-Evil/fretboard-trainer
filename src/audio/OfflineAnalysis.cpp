#include "audio/OfflineAnalysis.h"

#include <algorithm>
#include <cmath>

namespace ft
{

AnalysisRun analyseOffline (const std::vector<float>& signal, double sampleRate, const OfflineOptions& options)
{
    Analyzer analyzer;
    analyzer.prepare ({ sampleRate, options.minHz, options.maxHz, options.tuning });
    analyzer.setRecording (options.recording);

    NoiseGate gate;
    gate.prepare (sampleRate);
    gate.setParameters (options.gate);

    AnalysisRun run;
    run.frameSize = static_cast<int> (std::lround (analyzer.getFrameDurationSec() * sampleRate));
    Analyzer::Output out;
    size_t cursor = 0;
    if (! options.expectedSequence.empty())
        analyzer.setExpectedNotes ({ options.expectedSequence.front() });
    const auto block = static_cast<size_t> (std::max (1, options.blockSize));
    std::vector<float> gated (block);

    for (size_t pos = 0; pos < signal.size(); pos += block)
    {
        const auto n = std::min (block, signal.size() - pos);
        std::copy_n (signal.begin() + static_cast<std::ptrdiff_t> (pos), n, gated.begin());
        gate.process (gated.data(), static_cast<int> (n));

        out.clear();
        analyzer.process (signal.data() + pos, static_cast<int> (n), gate.isOpen(), out);

        const auto now = static_cast<double> (pos + n) / sampleRate;
        for (const auto& ev : out.notes)
        {
            run.notes.push_back ({ ev, now });

            if (cursor < options.expectedSequence.size() && ev.midi == options.expectedSequence[cursor])
            {
                ++cursor;
                analyzer.setExpectedNotes (cursor < options.expectedSequence.size()
                                               ? std::vector<int> { options.expectedSequence[cursor] }
                                               : std::vector<int> {});
            }
        }
        run.onsets.insert (run.onsets.end(), out.onsets.begin(), out.onsets.end());
        run.pitches.insert (run.pitches.end(), out.pitches.begin(), out.pitches.end());
    }

    return run;
}

} // namespace ft
