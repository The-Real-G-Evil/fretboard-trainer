#include "audio/NoteTracker.h"
#include "audio/MusicMath.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace ft
{

namespace
{
    /** Intervalle, um die sich die Tonhoehenerkennung typischerweise irrt (Obertoene 2-6, 8). */
    bool isHarmonicInterval (int semitones) noexcept
    {
        switch (std::abs (semitones))
        {
            case 12: case 19: case 24: case 28: case 31: case 36: return true;
            default: return false;
        }
    }
}

void NoteTracker::reset()
{
    currentMidi = -1;
    notePeakDb = -100.0f;
    candidateMidi = -1;
    candidateCount = 0;
    candidateDone = false;
    candidateCentsSum = 0.0;
    lastVoicedSec = -1.0;
    onsetPending = false;
    levels = {};
    levelHead = 0;
}

void NoteTracker::setLevels (NoteEvent& ev) const noexcept
{
    float peak = -100.0f, before = -100.0f;
    double beforeSec = -1.0;

    for (const auto& p : levels)
    {
        if (p.endSec < 0.0)
            continue;
        if (p.endSec >= ev.timeSec)
            peak = std::max (peak, p.levelDb);
        else if (p.endSec > beforeSec)
        {
            beforeSec = p.endSec;
            before = p.levelDb;
        }
    }

    ev.levelDb = peak;
    ev.riseDb = peak - before;
}

void NoteTracker::onOnset (double timeSec) noexcept
{
    onsetPending = true;
    onsetSec = timeSec;
    candidateMidi = -1;
    candidateCount = 0;
    candidateDone = false;
}

std::optional<NoteEvent> NoteTracker::onFrame (const Frame& frame) noexcept
{
    levels[levelHead] = { frame.frameEndSec, frame.levelDb };
    levelHead = (levelHead + 1) % levelHistory;

    if (onsetPending && frame.frameEndSec - onsetSec > cfg.onsetTimeoutSec)
        onsetPending = false;

    // Fenster enthaelt noch Signal von vor dem Anschlag -> nicht verwertbar
    if (onsetPending && frame.frameStartSec < onsetSec)
        return std::nullopt;

    if (! frame.voiced || frame.hz <= 0.0f)
    {
        candidateMidi = -1;
        candidateCount = 0;

        if (currentMidi >= 0 && lastVoicedSec >= 0.0 && frame.frameEndSec - lastVoicedSec > cfg.releaseSec)
            currentMidi = -1;

        return std::nullopt;
    }

    lastVoicedSec = frame.frameEndSec;
    notePeakDb = std::max (notePeakDb, frame.levelDb);
    const auto note = nearestNote (frame.hz);

    if (note.midi != candidateMidi)
    {
        candidateMidi = note.midi;
        candidateCount = 0;
        candidateCentsSum = 0.0;
        candidateDone = false;
        // Neue Tonhoehe dominiert, sobald etwa die halbe Fensterlaenge neu ist
        candidateStartSec = 0.5 * (frame.frameStartSec + frame.frameEndSec);
    }

    ++candidateCount;
    candidateCentsSum += note.cents;

    if (candidateDone)
        return std::nullopt;

    const auto meanCents = static_cast<float> (candidateCentsSum / candidateCount);

    NoteEvent ev;
    ev.midi = candidateMidi;
    ev.cents = meanCents;

    if (onsetPending)
    {
        if (candidateCount < cfg.stableFrames)
            return std::nullopt;

        ev.onsetType = OnsetType::pick;
        ev.timeSec = onsetSec;
        onsetPending = false;
    }
    else if (currentMidi < 0)
    {
        // ohne erkannten Anschlag aus der Stille heraus = (weicher) Anschlag
        if (candidateCount < cfg.stableFrames)
            return std::nullopt;

        ev.onsetType = OnsetType::pick;
        ev.timeSec = candidateStartSec;
    }
    else if (candidateMidi != currentMidi)
    {
        // Sprung um ein Oberton-Intervall ohne Anschlag: Fehler der Erkennung, Note klingt weiter
        if (isHarmonicInterval (candidateMidi - currentMidi))
        {
            candidateDone = true;
            return std::nullopt;
        }

        // Zwischentoene beim Umgreifen enden mit dem naechsten Anschlag (onOnset verwirft sie)
        if (candidateCount < std::max (cfg.stableFrames, cfg.legatoFrames))
            return std::nullopt;

        // Verschiebung beim Ausklingen/Loslassen: weder sauber intoniert noch laut genug
        if (std::abs (meanCents) > cfg.legatoMaxCents || frame.levelDb < notePeakDb - cfg.legatoMaxDropDb)
            return std::nullopt;

        ev.onsetType = OnsetType::legato;
        ev.timeSec = candidateStartSec;
    }
    else
    {
        candidateDone = true; // gleiche Note klingt weiter
        return std::nullopt;
    }

    candidateDone = true;
    currentMidi = candidateMidi;
    notePeakDb = frame.levelDb;
    setLevels (ev);
    return ev;
}

} // namespace ft
