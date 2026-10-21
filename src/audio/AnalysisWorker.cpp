#include "audio/AnalysisWorker.h"
#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    constexpr int idleWaitMs = 3;
}

AnalysisWorker::AnalysisWorker (AudioEngine& e)
    : juce::Thread ("Analyse"), engine (e)
{
    output.pitches.reserve (64);
    output.onsets.reserve (8);
    output.notes.reserve (8);
}

AnalysisWorker::~AnalysisWorker()
{
    stop();
}

void AnalysisWorker::start()
{
    startThread (juce::Thread::Priority::high);
}

void AnalysisWorker::stop()
{
    stopThread (1000);
}

void AnalysisWorker::setDetectionConfig (const DetectionConfig& cfg)
{
    const juce::ScopedLock sl (configLock);
    config = cfg;
    ++configVersion;
}

void AnalysisWorker::setExpectedNotes (std::vector<int> midis)
{
    const juce::ScopedLock sl (configLock);
    expectedNotes = std::move (midis);
    ++expectedVersion;
}

AnalysisWorker::PitchInfo AnalysisWorker::getLatestPitch() const noexcept
{
    return { latestHz.load (std::memory_order_relaxed),
             latestConfidence.load (std::memory_order_relaxed),
             latestVoiced.load (std::memory_order_relaxed) };
}

void AnalysisWorker::startRecording (double maxSec)
{
    const juce::ScopedLock sl (recordLock);
    recorded = {};
    recordMaxSec = maxSec;
    recorded.sampleRate = engine.getSampleRate();
    recorded.samples.reserve (static_cast<size_t> (recorded.sampleRate * 30.0));
    recording = true;
}

AnalysisWorker::RecordedAudio AnalysisWorker::stopRecording()
{
    const juce::ScopedLock sl (recordLock);
    recording = false;
    return std::exchange (recorded, {});
}

void AnalysisWorker::prepareAnalyzer()
{
    Analyzer::Config c;
    {
        const juce::ScopedLock sl (configLock);
        appliedConfigVersion = configVersion;
        c.minHz = config.minHz;
        c.maxHz = config.maxHz;
        c.tuning = config.tuning;
    }

    appliedGeneration = engine.getStreamGeneration();
    c.sampleRate = engine.getSampleRate();
    analyzer.prepare (c);
    prepared = true;
    needStartSample = true; // Bezug zur Stream-Uhr mit dem naechsten Abschnitt
}

void AnalysisWorker::run()
{
    AudioEngine::AnalysisChunk chunk;

    while (! threadShouldExit())
    {
        bool reconfigure = ! prepared || appliedGeneration != engine.getStreamGeneration();
        {
            const juce::ScopedLock sl (configLock);
            reconfigure = reconfigure || appliedConfigVersion != configVersion;
        }

        if (reconfigure)
        {
            prepareAnalyzer();
            appliedExpectedVersion = ~0u; // erwartete Toene im neuen Analyzer neu setzen
        }

        {
            const juce::ScopedLock sl (configLock);
            if (appliedExpectedVersion != expectedVersion)
            {
                analyzer.setExpectedNotes (expectedNotes);
                appliedExpectedVersion = expectedVersion;
            }
        }

        bool gotData = false;

        while (engine.popAnalysisChunk (chunk))
        {
            gotData = true;

            if (needStartSample)
            {
                analyzerStartSample = chunk.streamSample;
                needStartSample = false;
            }

            if (recording.load())
            {
                const juce::ScopedLock sl (recordLock);
                const auto maxSamples = static_cast<size_t> (recorded.sampleRate * recordMaxSec);

                if (recorded.samples.empty() && recorded.sampleRate > 0.0)
                    recorded.startSec = static_cast<double> (chunk.streamSample) / recorded.sampleRate;

                if (recorded.samples.size() + static_cast<size_t> (chunk.numSamples) <= maxSamples)
                    recorded.samples.insert (recorded.samples.end(), chunk.samples.begin(), chunk.samples.begin() + chunk.numSamples);
                else
                    recorded.truncated = true;
            }

            output.clear();
            analyzer.process (chunk.samples.data(), chunk.numSamples, chunk.gateOpen, output);

            if (! output.pitches.empty())
            {
                const auto& p = output.pitches.back().pitch;
                latestHz.store (p.voiced ? p.hz : 0.0f, std::memory_order_relaxed);
                latestConfidence.store (p.confidence, std::memory_order_relaxed);
                latestVoiced.store (p.voiced, std::memory_order_relaxed);
            }

            const auto startSec = static_cast<double> (analyzerStartSample) / analyzer.getConfig().sampleRate;
            for (auto ev : output.notes)
            {
                ev.timeSec += startSec;
                noteFifo.push (ev);
            }

            if (threadShouldExit())
                return;
        }

        if (! gotData)
            wait (idleWaitMs);
    }
}

} // namespace ft
