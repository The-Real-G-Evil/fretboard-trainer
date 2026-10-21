#pragma once

#include "audio/Analyzer.h"
#include "audio/NoiseGate.h"

#include <vector>

namespace ft
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

struct OfflineOptions
{
    float minHz = 55.0f;
    float maxHz = 1500.0f;
    DetectionTuning tuning;
    NoiseGate::Parameters gate;
    int blockSize = 128;              ///< wie AudioEngine::AnalysisChunk::capacity
    Analyzer::Recording* recording = nullptr; ///< optional: Hop-Merkmale mitschreiben

    /** Optional: erwartete Tonfolge wie beim Ueben. Erwartet ist jeweils der naechste noch nicht
        gespielte Ton; er rueckt vor, sobald er erkannt wurde (wie der Cursor in der App). */
    std::vector<int> expectedSequence;
};

/** Laesst ein Signal wie in der App blockweise durch Noisegate und Analyzer laufen.
    Das Ergebnis entspricht der Live-Erkennung. */
AnalysisRun analyseOffline (const std::vector<float>& signal, double sampleRate, const OfflineOptions& options = {});

} // namespace ft
