#pragma once

#include "audio/Analyzer.h"
#include "audio/ExpectedNotes.h"
#include "audio/NoiseGate.h"

#include <functional>
#include <vector>

namespace ft
{

//==============================================================================
// Bewertung einer Aufnahme gegen die erwartete Notenfolge

enum class AlignKind
{
    correct,    ///< richtige Note, richtige Anschlagsart
    wrongType,  ///< richtige Note, aber pick/legato vertauscht
    wrongPitch, ///< andere Note erkannt
    missing,    ///< erwartete Note nicht erkannt
    extra       ///< zusaetzlich erkannte Note
};

struct AlignedNote
{
    AlignKind kind = AlignKind::correct;
    int expectedIndex = -1; ///< -1 bei extra
    int detectedIndex = -1; ///< -1 bei missing
};

struct TakeScore
{
    int expected = 0, correct = 0, wrongType = 0, wrongPitch = 0, missing = 0, extra = 0;
    double errorCost = 0.0; ///< wrongPitch + missing + extra + 0.5 * wrongType
    double accuracy = 0.0;  ///< 1 - errorCost / expected, auf 0..1 begrenzt
    std::vector<AlignedNote> alignment;
};

/** Richtet erkannte an erwarteten Noten aus (Editierdistanz, nur Reihenfolge, keine Zeiten). */
TakeScore scoreTake (const std::vector<ExpectedNote>& expected, const std::vector<NoteEvent>& detected);

//==============================================================================
// Grundrauschen

struct NoiseProfile
{
    float peakDb = -100.0f;          ///< hoechste Spitze
    float typicalPeakDb = -100.0f;   ///< 95. Perzentil der Spitzen je 10-ms-Block (robust gegen einzelnes Klacken)
    float rmsDb = -100.0f;
    float suggestedGateDb = -60.0f;  ///< typische Spitze + 6 dB, begrenzt auf -90 .. maxSuggestedGateDb
    bool  quiet = true;              ///< false: es klang noch etwas (Saiten nicht abgedaempft?)
};

inline constexpr float maxSuggestedGateDb = -35.0f; ///< hoeher wuerde das Gate Toene abschneiden
inline constexpr float quietLimitDb = -45.0f;       ///< typische Spitze darueber gilt nicht als Ruhe

/** Misst Ruhe-Aufnahmen (Saiten abgedaempft). Die ersten/letzten 200 ms werden ignoriert. */
NoiseProfile measureNoise (const std::vector<float>& signal, double sampleRate);

//==============================================================================
// Optimierung der Erkennungsparameter

struct CalibrationTake
{
    Analyzer::Recording recording;
    ExpectedNotes expected;
};

/** Analysiert eine Aufnahme einmal vollstaendig und zeichnet die Hop-Merkmale auf. */
CalibrationTake makeCalibrationTake (const std::vector<float>& signal, double sampleRate,
                                     const ExpectedNotes& expected, const NoiseGate::Parameters& gate);

struct TuningEvaluation
{
    DetectionTuning tuning;
    double totalCost = 0.0;
    std::vector<TakeScore> scores; ///< je Aufnahme
};

TuningEvaluation evaluateTuning (const std::vector<CalibrationTake>& takes, const DetectionTuning& tuning);

struct CalibrationResult
{
    TuningEvaluation current; ///< mit den bisherigen Parametern
    TuningEvaluation best;    ///< bester gefundener Satz (nie schlechter als current)
    int combinationsTried = 0;
};

/** Alle Parameterkombinationen, die die Optimierung durchprobiert. */
std::vector<DetectionTuning> tuningCandidates();

/** Probiert alle Kandidaten auf allen Aufnahmen. Bei gleichem Fehler gewinnt der Satz, der
    am naechsten an current liegt. progress (0..1) liefert false zum Abbrechen. */
CalibrationResult optimiseTuning (const std::vector<CalibrationTake>& takes, const DetectionTuning& current,
                                  const std::function<bool (float)>& progress = {});

} // namespace ft
