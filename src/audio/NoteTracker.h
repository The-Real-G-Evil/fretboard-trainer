#pragma once

#include <optional>

namespace ft
{

enum class OnsetType
{
    pick,   ///< angeschlagen (Anschlags-Transient erkannt)
    legato  ///< Tonhoehenwechsel ohne Anschlag (Hammer-on/Pull-off/Slide)
};

struct NoteEvent
{
    int       midi  = 0;
    float     cents = 0.0f;
    double    timeSec = 0.0;
    OnsetType onsetType = OnsetType::pick;
};

/** Macht aus Tonhoehen-Frames und Anschlaegen Noten-Ereignisse.

    - Eine Note gilt erst, wenn dieselbe MIDI-Note in stableFrames aufeinanderfolgenden
      Frames erkannt wurde (Oktave inklusive).
    - Nach einem Anschlag werden Frames ignoriert, deren Analysefenster noch vor dem
      Anschlag beginnt; die naechste stabile Note wird als "pick" gemeldet, auch wenn
      sie gleich der vorherigen ist (erneuter Anschlag).
    - Wechselt die stabile Note ohne Anschlag, wird sie als "legato" gemeldet.
*/
class NoteTracker
{
public:
    struct Config
    {
        int    stableFrames      = 3;
        double releaseSec        = 0.06;  ///< so lange stimmlos -> keine aktuelle Note mehr
        double onsetTimeoutSec   = 0.30;  ///< Anschlag ohne stabile Tonhoehe verfaellt
    };

    struct Frame
    {
        double frameStartSec = 0.0; ///< Beginn des Analysefensters
        double frameEndSec   = 0.0; ///< Ende des Analysefensters
        float  hz            = 0.0f;
        bool   voiced        = false;
    };

    void setConfig (const Config& c) { cfg = c; }
    void reset();

    void onOnset (double timeSec) noexcept;
    std::optional<NoteEvent> onFrame (const Frame& frame) noexcept;

    /** Aktuell klingende Note oder -1. */
    int getCurrentNote() const noexcept { return currentMidi; }

private:
    Config cfg;

    int    currentMidi = -1;
    int    candidateMidi = -1;
    int    candidateCount = 0;
    double candidateStartSec = 0.0;
    double candidateCentsSum = 0.0;
    double lastVoicedSec = -1.0;

    bool   onsetPending = false;
    double onsetSec = 0.0;
};

} // namespace ft
