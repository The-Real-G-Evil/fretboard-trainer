#pragma once

#include <array>
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
    bool      corrected = false; ///< anhand des erwarteten Tons und des Spektrums korrigiert
    float     levelDb = -100.0f; ///< Spitzenpegel (Huellkurve) vom Beginn der Note bis zur Meldung
    float     riseDb  = 0.0f;    ///< levelDb gegenueber dem Pegel direkt vor Beginn der Note
};

/** Macht aus Tonhoehen-Frames und Anschlaegen Noten-Ereignisse.

    - Eine Note gilt erst, wenn dieselbe MIDI-Note in stableFrames aufeinanderfolgenden
      Frames erkannt wurde (Oktave inklusive).
    - Nach einem Anschlag werden Frames ignoriert, deren Analysefenster noch vor dem
      Anschlag beginnt; die naechste stabile Note wird als "pick" gemeldet, auch wenn
      sie gleich der vorherigen ist (erneuter Anschlag).
    - Wechselt die stabile Note ohne Anschlag, wird sie als "legato" gemeldet – aber nur,
      wenn sie sauber intoniert ist (legatoMaxCents) und nicht im leisen Ausklingen liegt
      (legatoMaxDropDb unter dem Spitzenpegel der Note). So werden Tonhoehen-Verschiebungen
      beim Ausklingen oder Loslassen der Saite nicht als Noten gemeldet.
    - Ein Legato-Ton muss legatoFrames lang stabil sein. Kommt vorher ein Anschlag, war es
      nur ein Zwischenton beim Umgreifen (Finger loest sich, Saite klingt kurz anders).
    - Jede Note traegt ihren Pegel und den Anstieg gegenueber vorher: Ein echter Anschlag ist
      deutlich lauter als das, was vorher klang; eine mitschwingende Saite oder ein Griffgeraeusch
      nicht (Grundlage fuer die Bewertung beim Ueben).
    - Ein Wechsel um ein Oberton-Intervall (Oktave, Duodezime, Doppeloktave …) ohne Anschlag
      gilt nicht als neue Note: Auf Saiteninstrumenten ist das praktisch immer ein Fehler der
      Tonhoehenerkennung (typisch bei tiefen Saiten, deren Grundton schneller abklingt als
      die Obertoene). Die bisherige Note klingt weiter.
*/
class NoteTracker
{
public:
    struct Config
    {
        int    stableFrames       = 3;
        int    legatoFrames       = 12;
        float  legatoMaxCents     = 35.0f;
        float  legatoMaxDropDb    = 24.0f;
        double releaseSec         = 0.06;   ///< so lange stimmlos -> keine aktuelle Note mehr
        double onsetTimeoutSec    = 0.30;   ///< Anschlag ohne stabile Tonhoehe verfaellt
    };

    struct Frame
    {
        double frameStartSec = 0.0; ///< Beginn des Analysefensters
        double frameEndSec   = 0.0; ///< Ende des Analysefensters
        float  hz            = 0.0f;
        bool   voiced        = false;
        float  levelDb       = 0.0f; ///< Huellkurvenpegel am Frame-Ende
    };

    void setConfig (const Config& c) { cfg = c; }
    void reset();

    void onOnset (double timeSec) noexcept;
    std::optional<NoteEvent> onFrame (const Frame& frame) noexcept;

    /** Aktuell klingende Note oder -1. */
    int getCurrentNote() const noexcept { return currentMidi; }

    /** Ende des letzten stimmhaften Frames (s), -1 = noch keiner. */
    double getLastVoicedSec() const noexcept { return lastVoicedSec; }

private:
    Config cfg;

    int    currentMidi = -1;
    float  notePeakDb = -100.0f;
    int    candidateMidi = -1;
    int    candidateCount = 0;
    bool   candidateDone = false;   ///< Kandidat wurde bereits gemeldet oder verworfen
    double candidateStartSec = 0.0;
    double candidateCentsSum = 0.0;
    double lastVoicedSec = -1.0;

    bool   onsetPending = false;
    double onsetSec = 0.0;

    /** Pegel der letzten Frames (Ringpuffer) fuer Pegel und Anstieg einer Note. */
    struct LevelPoint { double endSec = -1.0; float levelDb = -100.0f; };
    static constexpr size_t levelHistory = 128; // 48 kHz: ca. 0,7 s
    std::array<LevelPoint, levelHistory> levels {};
    size_t levelHead = 0;

    void setLevels (NoteEvent& ev) const noexcept;
};

} // namespace ft
