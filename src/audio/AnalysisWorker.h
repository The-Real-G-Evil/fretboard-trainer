#pragma once

#include "audio/Analyzer.h"
#include "audio/SpscFifo.h"

#include <juce_core/juce_core.h>

#include <atomic>
#include <vector>

namespace ft
{

class AudioEngine;

/** Analyse-Thread: holt das Eingangssignal aus der AudioEngine, bestimmt Tonhoehe,
    Anschlaege und Noten und stellt die Ergebnisse lock-frei fuer den UI-Thread bereit.
    Auf Wunsch schneidet er das Eingangssignal (nach Gain, vor dem Gate) mit.

    Der Analyse-Thread ist kein Echtzeit-Thread; Konfiguration und Aufnahme werden mit
    einem kurzen Lock zwischen UI- und Analyse-Thread uebergeben.
*/
class AnalysisWorker : private juce::Thread
{
public:
    struct DetectionConfig
    {
        float minHz          = 55.0f;
        float maxHz          = 1500.0f;
        float centsTolerance = 25.0f; ///< fuer die Bewertung (ab Phase 3) und die Stimmgeraet-Anzeige
        DetectionTuning tuning;
    };

    struct PitchInfo
    {
        float hz = 0.0f;
        float confidence = 0.0f;
        bool  voiced = false;
    };

    struct RecordedAudio
    {
        std::vector<float> samples;
        double sampleRate = 0.0;
        double startSec = -1.0; ///< Stream-Uhr des ersten Samples (wie NoteEvent::timeSec), -1 = leer
        bool truncated = false; ///< maximale Laenge erreicht
    };

    static constexpr double maxRecordingSec = 180.0;

    explicit AnalysisWorker (AudioEngine& engine);
    ~AnalysisWorker() override;

    void start();
    void stop();

    /** UI-Thread. Wird beim naechsten Durchlauf des Analyse-Threads uebernommen. */
    void setDetectionConfig (const DetectionConfig& cfg);

    /** UI-Thread: aktuell erwartete Toene (beim Ueben), fuer die Oktavpruefung im Analyzer. */
    void setExpectedNotes (std::vector<int> midis);

    /** UI-Thread: letzte Tonhoehe (kontinuierlich, fuer das Stimmgeraet). */
    PitchInfo getLatestPitch() const noexcept;

    /** UI-Thread (einziger Leser): naechste erkannte Note. Zeit in s auf der Stream-Uhr der
        AudioEngine (dieselbe Uhr wie die Metronom-Schlaege). */
    bool popNote (NoteEvent& ev) noexcept { return noteFifo.pop (ev); }

    /** UI-Thread (einziger Leser): naechstes Ergebnis der Akkordpruefung (Zeit wie bei popNote). */
    bool popChord (Analyzer::ChordEvent& ev) noexcept { return chordFifo.pop (ev); }

    /** UI-Thread: Mitschnitt starten (verwirft einen laufenden) bzw. beenden und abholen. */
    void startRecording (double maxSec = maxRecordingSec);
    RecordedAudio stopRecording();
    bool isRecording() const noexcept { return recording.load(); }

private:
    void run() override;
    void prepareAnalyzer();

    AudioEngine& engine;
    Analyzer analyzer;
    Analyzer::Output output;

    juce::CriticalSection configLock;
    DetectionConfig config;
    std::vector<int> expectedNotes;
    unsigned expectedVersion = 0, appliedExpectedVersion = 0;
    unsigned configVersion = 1;
    unsigned appliedConfigVersion = 0, appliedGeneration = 0;
    long long analyzerStartSample = 0; ///< Stream-Sample, ab dem der Analyzer zaehlt
    bool needStartSample = true;
    bool prepared = false;

    std::atomic<float> latestHz { 0.0f }, latestConfidence { 0.0f };
    std::atomic<bool> latestVoiced { false };
    SpscFifo<NoteEvent, 256> noteFifo;
    SpscFifo<Analyzer::ChordEvent, 64> chordFifo;

    juce::CriticalSection recordLock;
    std::atomic<bool> recording { false };
    RecordedAudio recorded;
    double recordMaxSec = maxRecordingSec;
};

} // namespace ft
