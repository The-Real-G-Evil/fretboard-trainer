#pragma once

#include "audio/Analyzer.h"

#include <optional>
#include <vector>

namespace ft
{

/** Nachanalyse einer Aufnahme (SPEC: Aufnahme und Nachanalyse).

    1. segmentNotes(): Aus den Tonhoehen-Frames der ganzen Aufnahme wird mit einem Hidden-Markov-Modell
       (Zustaende: jeder Ton im Tonbereich + Stille, Viterbi) die wahrscheinlichste Tonfolge bestimmt.
       Anders als live darf die Auswertung in die Zukunft schauen: kurze Aussetzer, Oktavspruenge
       einzelner Frames und Einschwingvorgaenge glaettet das Modell. Tonwechsel sind teuer, ausser an
       einem erkannten Anschlag; der Beginn jeder Note wird rueckwirkend auf ihren Anschlag gelegt, und
       ein Anschlag mitten in einer Note teilt sie (erneut angeschlagener gleicher Ton).
    2. alignNotes(): Die erkannten Noten werden per Dynamic Time Warping (globale Ausrichtung mit
       Einfuege-/Auslasskosten) an der erwarteten Notenfolge ausgerichtet – mit Zeitangaben (getaktet)
       zaehlt auch der Zeitpunkt, sonst nur die Reihenfolge (Warte-Modus). */

struct NoteSegment
{
    double startSec = 0.0;
    double endSec = 0.0;
    int    midi = 0;
    float  cents = 0.0f;  ///< Median der Abweichung in den Frames der Note
    bool   pick = false;  ///< beginnt an einem erkannten Anschlag (sonst Tonwechsel ohne Anschlag)
};

struct SegmentationConfig
{
    double sampleRate = 48000.0;
    int    frameSize = 2048;     ///< Analysefenster der Tonhoehen-Frames
    int    minMidi = 28, maxMidi = 96;
    double minNoteSec = 0.03;    ///< kuerzere Noten entfallen
    double changePenalty = 8.0;  ///< Tonwechsel ohne Anschlag
    double onsetChangePenalty = 0.5; ///< Tonwechsel an einem Anschlag
    double silencePenalty = 2.5; ///< Wechsel Ton <-> Stille
};

std::vector<NoteSegment> segmentNotes (const std::vector<Analyzer::PitchFrame>& frames,
                                       const std::vector<double>& onsets, const SegmentationConfig& config);

struct ExpectedItem
{
    std::vector<int> midis;          ///< Akkord: mehrere (ein erkannter Akkordton genuegt)
    std::optional<double> timeSec;   ///< faellig um (Aufnahme-Zeit); leer: nur Reihenfolge
};

enum class AlignVerdict { hit, early, late, octave, wrong, missed };

struct AlignedItem
{
    int segment = -1;                ///< Index in den Segmenten (-1: verpasst)
    AlignVerdict verdict = AlignVerdict::missed;
    double timingErrorMs = 0.0;      ///< mit Zeitangabe: + zu spaet
};

struct Alignment
{
    std::vector<AlignedItem> items;  ///< je erwarteter Note
    std::vector<int> extra;          ///< zusaetzlich gespielte Noten (Fehlversuche), nur deutliche Anschlaege
    int hits = 0;
};

struct AlignConfig
{
    double toleranceSec = 0.0;       ///< 0: ohne Zeitbewertung
};

Alignment alignNotes (const std::vector<ExpectedItem>& expected, const std::vector<NoteSegment>& segments,
                      const AlignConfig& config);

} // namespace ft
