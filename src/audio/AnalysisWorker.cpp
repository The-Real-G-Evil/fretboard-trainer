#include "audio/AnalysisWorker.h"
#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    constexpr int idleWaitMs = 3;

    /** Spitzenpegel der Note -> MIDI-Anschlagsstaerke (-48 dBFS -> 1, -6 dBFS und lauter -> 127). */
    juce::uint8 velocityFor (float levelDb) noexcept
    {
        return static_cast<juce::uint8> (juce::jlimit (1, 127, juce::roundToInt (1.0f + 126.0f * (levelDb + 48.0f) / 42.0f)));
    }
}

AnalysisWorker::AnalysisWorker (AudioEngine& e)
    : juce::Thread ("Analyse"), engine (e)
{
    output.pitches.reserve (64);
    output.onsets.reserve (8);
    output.notes.reserve (8);
    output.chords.reserve (4);
    output.noteOffs.reserve (4);
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

void AnalysisWorker::setMidiOutput (std::unique_ptr<juce::MidiOutput> out, int channel)
{
    std::unique_ptr<juce::MidiOutput> old;
    {
        const juce::ScopedLock sl (midiLock);
        if (midiOut != nullptr && midiActiveNote >= 0)
            midiOut->sendMessageNow (juce::MidiMessage::noteOff (midiChannel, midiActiveNote));
        midiActiveNote = -1;
        old = std::exchange (midiOut, std::move (out));
        midiChannel = juce::jlimit (1, 16, channel);
    }
    // altes Geraet ausserhalb des Locks schliessen
}

void AnalysisWorker::sendMidi (const Analyzer::Output& out)
{
    const juce::ScopedLock sl (midiLock);
    if (midiOut == nullptr || (out.notes.empty() && out.noteOffs.empty()))
        return;

    // Noten und Notenenden in zeitlicher Reihenfolge; eine neue Note beendet die vorige
    size_t n = 0, f = 0;
    while (n < out.notes.size() || f < out.noteOffs.size())
    {
        const bool noteFirst = f >= out.noteOffs.size()
                               || (n < out.notes.size() && out.notes[n].timeSec <= out.noteOffs[f]);
        if (midiActiveNote >= 0)
            midiOut->sendMessageNow (juce::MidiMessage::noteOff (midiChannel, midiActiveNote));
        midiActiveNote = -1;

        if (noteFirst)
        {
            const auto& ev = out.notes[n++];
            midiActiveNote = juce::jlimit (0, 127, ev.midi);
            midiOut->sendMessageNow (juce::MidiMessage::noteOn (midiChannel, midiActiveNote, velocityFor (ev.levelDb)));
        }
        else
        {
            ++f;
        }
    }
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
            for (auto ev : output.chords)
            {
                ev.timeSec += startSec;
                chordFifo.push (ev);
            }
            for (const auto t : output.onsets)
                onsetFifo.push (t + startSec);
            for (const auto t : output.noteOffs)
                noteOffFifo.push (t + startSec);
            sendMidi (output);

            if (threadShouldExit())
                return;
        }

        if (! gotData)
            wait (idleWaitMs);
    }
}

} // namespace ft
