#pragma once

#include "audio/Analyzer.h"
#include "audio/SpscFifo.h"

#include <juce_core/juce_core.h>

#include <atomic>

namespace ft
{

class AudioEngine;

/** Analyse-Thread: holt das Eingangssignal aus der AudioEngine, bestimmt Tonhoehe,
    Anschlaege und Noten und stellt die Ergebnisse lock-frei fuer den UI-Thread bereit.
*/
class AnalysisWorker : private juce::Thread
{
public:
    struct DetectionConfig
    {
        float minHz          = 55.0f;
        float maxHz          = 1500.0f;
        float centsTolerance = 25.0f; ///< fuer die Bewertung (ab Phase 3) und die Stimmgeraet-Anzeige
    };

    struct PitchInfo
    {
        float hz = 0.0f;
        float confidence = 0.0f;
        bool  voiced = false;
    };

    explicit AnalysisWorker (AudioEngine& engine);
    ~AnalysisWorker() override;

    void start();
    void stop();

    /** UI-Thread. Wird beim naechsten Durchlauf des Analyse-Threads uebernommen. */
    void setDetectionConfig (const DetectionConfig& cfg) noexcept;

    /** UI-Thread: letzte Tonhoehe (kontinuierlich, fuer das Stimmgeraet). */
    PitchInfo getLatestPitch() const noexcept;

    /** UI-Thread (einziger Leser): naechste erkannte Note. Zeit in s seit Start der Analyse. */
    bool popNote (NoteEvent& ev) noexcept { return noteFifo.pop (ev); }

private:
    void run() override;
    void prepareAnalyzer();

    AudioEngine& engine;
    Analyzer analyzer;
    Analyzer::Output output;

    std::atomic<float> minHz { 55.0f }, maxHz { 1500.0f };
    std::atomic<unsigned> configVersion { 1 };
    unsigned appliedConfigVersion = 0, appliedGeneration = 0;
    double timeOffsetSec = 0.0;
    bool prepared = false;

    std::atomic<float> latestHz { 0.0f }, latestConfidence { 0.0f };
    std::atomic<bool> latestVoiced { false };
    SpscFifo<NoteEvent, 256> noteFifo;
};

} // namespace ft
