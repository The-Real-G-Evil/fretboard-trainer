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

void AnalysisWorker::setDetectionConfig (const DetectionConfig& cfg) noexcept
{
    minHz.store (cfg.minHz, std::memory_order_relaxed);
    maxHz.store (cfg.maxHz, std::memory_order_relaxed);
    configVersion.fetch_add (1, std::memory_order_release);
}

AnalysisWorker::PitchInfo AnalysisWorker::getLatestPitch() const noexcept
{
    return { latestHz.load (std::memory_order_relaxed),
             latestConfidence.load (std::memory_order_relaxed),
             latestVoiced.load (std::memory_order_relaxed) };
}

void AnalysisWorker::prepareAnalyzer()
{
    // Zeitachse laeuft ueber Neukonfigurationen hinweg weiter
    if (prepared)
        timeOffsetSec += analyzer.getTimeSec();

    appliedConfigVersion = configVersion.load (std::memory_order_acquire);
    appliedGeneration = engine.getStreamGeneration();

    Analyzer::Config c;
    c.sampleRate = engine.getSampleRate();
    c.minHz = minHz.load (std::memory_order_relaxed);
    c.maxHz = maxHz.load (std::memory_order_relaxed);
    analyzer.prepare (c);
    prepared = true;
}

void AnalysisWorker::run()
{
    AudioEngine::AnalysisChunk chunk;

    while (! threadShouldExit())
    {
        if (! prepared
            || appliedConfigVersion != configVersion.load (std::memory_order_acquire)
            || appliedGeneration != engine.getStreamGeneration())
            prepareAnalyzer();

        bool gotData = false;

        while (engine.popAnalysisChunk (chunk))
        {
            gotData = true;
            output.clear();
            analyzer.process (chunk.samples.data(), chunk.numSamples, chunk.gateOpen, output);

            if (! output.pitches.empty())
            {
                const auto& p = output.pitches.back().pitch;
                latestHz.store (p.voiced ? p.hz : 0.0f, std::memory_order_relaxed);
                latestConfidence.store (p.confidence, std::memory_order_relaxed);
                latestVoiced.store (p.voiced, std::memory_order_relaxed);
            }

            for (auto ev : output.notes)
            {
                ev.timeSec += timeOffsetSec;
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
