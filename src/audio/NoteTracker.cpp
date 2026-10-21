#include "audio/NoteTracker.h"
#include "audio/MusicMath.h"

namespace ft
{

void NoteTracker::reset()
{
    currentMidi = -1;
    candidateMidi = -1;
    candidateCount = 0;
    candidateCentsSum = 0.0;
    lastVoicedSec = -1.0;
    onsetPending = false;
}

void NoteTracker::onOnset (double timeSec) noexcept
{
    onsetPending = true;
    onsetSec = timeSec;
    candidateMidi = -1;
    candidateCount = 0;
}

std::optional<NoteEvent> NoteTracker::onFrame (const Frame& frame) noexcept
{
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
    const auto note = nearestNote (frame.hz);

    if (note.midi != candidateMidi)
    {
        candidateMidi = note.midi;
        candidateCount = 0;
        candidateCentsSum = 0.0;
        // Neue Tonhoehe dominiert, sobald etwa die halbe Fensterlaenge neu ist
        candidateStartSec = 0.5 * (frame.frameStartSec + frame.frameEndSec);
    }

    ++candidateCount;
    candidateCentsSum += note.cents;

    if (candidateCount != cfg.stableFrames)
        return std::nullopt;

    NoteEvent ev;
    ev.midi = candidateMidi;
    ev.cents = static_cast<float> (candidateCentsSum / candidateCount);

    if (onsetPending)
    {
        ev.onsetType = OnsetType::pick;
        ev.timeSec = onsetSec;
        onsetPending = false;
    }
    else if (candidateMidi != currentMidi)
    {
        // ohne erkannten Anschlag: aus der Stille heraus = (weicher) Anschlag, sonst Legato
        ev.onsetType = currentMidi < 0 ? OnsetType::pick : OnsetType::legato;
        ev.timeSec = candidateStartSec;
    }
    else
    {
        return std::nullopt; // gleiche Note klingt weiter
    }

    currentMidi = candidateMidi;
    return ev;
}

} // namespace ft
