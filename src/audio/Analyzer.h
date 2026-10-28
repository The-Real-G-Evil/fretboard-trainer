#pragma once

#include "audio/DetectionTuning.h"
#include "audio/NoteTracker.h"
#include "audio/OnsetDetector.h"
#include "audio/PitchDetector.h"

#include <array>
#include <vector>

namespace ft
{

/** Komplette Live-Analyse eines Mono-Signals: Tonhoehe (YIN), Anschlag, Noten-Ereignisse.

    Laeuft im Analyse-Thread (nicht im Audio-Thread). Samples werden in Hops von
    OnsetDetector::getHopSize() verarbeitet (48 kHz: 256 = 5.3 ms); pro Hop gibt es
    einen Tonhoehen-Frame und eine Anschlagspruefung.

    Optional werden pro Hop die tuning-unabhaengigen Merkmale aufgezeichnet (HopRecord).
    Mit replay() laesst sich eine Aufzeichnung dann ohne erneute Signalanalyse mit
    anderen DetectionTuning-Werten auswerten – das Ergebnis ist identisch mit einer
    vollstaendigen Analyse mit diesen Werten.
*/
class Analyzer
{
public:
    struct Config
    {
        double sampleRate = 48000.0;
        float  minHz = 55.0f;
        float  maxHz = 1500.0f;
        DetectionTuning tuning;
    };

    struct PitchFrame
    {
        double timeSec = 0.0; ///< Ende des Analysefensters
        PitchDetector::Result pitch;
    };

    static constexpr int maxChordTones = 8;

    struct ChordTone
    {
        int   midi = 0;
        bool  present = false;
        float strength = 0.0f;   ///< neue Teiltonenergie relativ zum staerksten Akkordton (0-1)
        float freshRatio = 0.0f; ///< Anteil der Energie, die durch den Anschlag neu entstanden ist
        bool  shared = false;    ///< alle Teiltoene fallen mit denen eines anderen Akkordtons zusammen (Oktave)
    };

    /** Ergebnis der Akkordpruefung nach einem Anschlag, wenn mehrere Toene erwartet werden. */
    struct ChordEvent
    {
        double timeSec = 0.0; ///< erster Anschlag (geschlagener Akkord: erste Saite)
        int count = 0;
        std::array<ChordTone, maxChordTones> tones {};
    };

    struct Output
    {
        std::vector<PitchFrame> pitches;
        std::vector<double>     onsets;
        std::vector<NoteEvent>  notes;
        std::vector<ChordEvent> chords;
        std::vector<double>     noteOffs; ///< Ende der klingenden Note (letzter stimmhafter Frame), z. B. fuer MIDI

        void clear() { pitches.clear(); onsets.clear(); notes.clear(); chords.clear(); noteOffs.clear(); }
    };

    struct HopRecord
    {
        OnsetDetector::HopFeatures onset;
        PitchDetector::Result pitch;
    };

    /** Aufzeichnung aller Hops eines Signals, unabhaengig vom Tuning. */
    struct Recording
    {
        Config config;          ///< tuning darin wird von replay() ersetzt
        int frameSize = 0;
        std::vector<HopRecord> hops;
    };

    /** Alloziert. */
    void prepare (const Config& config);
    const Config& getConfig() const noexcept { return cfg; }

    /** Erwartete Toene (beim Ueben bekannt). Weicht die Erkennung ab, wird im Spektrum geprueft, ob
        in Wahrheit der erwartete Ton klingt:
        - Oktave: Klingt der vorige Ton nach, wiederholt sich das Signal oft erst im gemeinsamen
          Grundmuster beider Toene, eine Oktave unter dem neuen Ton.
        - Mitklingende Saite: Beim Anschlag zaehlen nur Teiltoene, die durch den Anschlag neu
          entstanden sind (Spektrum direkt vor gegen nach dem Anschlag). Eine leere Saite, die schon
          vorher klang oder nur mitschwingt, liefert keine neuen Teiltoene.
        Ein wirklich falsch gespielter Ton bleibt erhalten, weil dann dessen Teiltoene neu sind.

        Akkorde (zwei und mehr erwartete Toene): Nach jedem Anschlag wird je erwartetem Ton geprueft,
        ob seine Teiltoene neu im Spektrum stehen (Vorlage aus den Teiltoenen 1-6 ohne die, die mit
        Teiltoenen anderer Akkordtoene zusammenfallen). Das Ergebnis kommt als ChordEvent, sobald das
        laengere Akkordfenster ganz hinter dem Anschlag liegt. Anschlaege kurz nacheinander
        (geschlagener Akkord) zaehlen als ein Akkord. */
    void setExpectedNotes (std::vector<int> midis);

    /** Ab jetzt jeden Hop in rec mitschreiben (nullptr beendet). rec.config/frameSize werden gesetzt. */
    void setRecording (Recording* rec);

    /** gateOpen: Zustand des Noisegates fuer diese Samples. Bei geschlossenem Gate
        wird keine Tonhoehe gemeldet und kein Anschlag erkannt. */
    void process (const float* samples, int numSamples, bool gateOpen, Output& out);

    /** Wertet eine Aufzeichnung mit anderem Tuning aus (nur Noten und Anschlaege). */
    static Output replay (const Recording& rec, const DetectionTuning& tuning);

    /** Latenz bis zum ersten auswertbaren Frame nach einem Anschlag (Fensterlaenge). */
    double getFrameDurationSec() const noexcept { return frameSize / cfg.sampleRate; }

    /** Zeit seit prepare() in Sekunden (Ende der bisher verarbeiteten Samples). */
    double getTimeSec() const noexcept { return static_cast<double> (totalSamples) / cfg.sampleRate; }

    /** Betrag der Frequenz hz im aktuellen Analysefenster (Hann, Goertzel). */
    double magnitudeAt (double hz) const noexcept;

    /** Durch den letzten Anschlag neu entstandene Energie der Teiltoene 1-4 eines Tons
        (gewichtet 1/h) und deren Gesamtenergie jetzt. Teiltoene, die mit einem Teilton von
        sharedWithF0 zusammenfallen, werden ausgelassen (0 = keine). Ohne Anschlag: {0, 0}. */
    std::pair<double, double> newPartialEnergy (double f0, double sharedWithF0 = 0.0) const noexcept;

    /** Eigene (ungerade) gegen mit der Oktave darueber geteilte (gerade) Teiltoene 1-8 eines Tons
        im aktuellen Fenster. Klein: der Ton ist eine Unteroktave (YIN hat die doppelte Periode
        gefunden, typisch kurz nach einem Anschlag, solange der alte Klang im Fenster liegt). */
    double ownPartialRatio (double f0) const noexcept;

private:
    void processHop (bool gateOpen, Output& out);
    void correctWithExpected (NoteEvent& ev) const noexcept;
    void onChordOnset (double onsetSec, Output& out);
    ChordEvent evaluateChord() const;
    static double magnitudeIn (const float* x, int n, const float* window, double hz, double sampleRate) noexcept;

    /** Gemeinsame Entscheidungslogik fuer Live-Analyse und replay(). */
    static void decideHop (const HopRecord& hop, double sampleRate, int frameSize,
                           OnsetDetector& onset, NoteTracker& tracker, Output& out, bool withPitchFrame);

    static OnsetDetector::Config onsetConfig (const Config& c);
    static NoteTracker::Config trackerConfig (const Config& c);

    Config cfg;
    PitchDetector pitch;
    OnsetDetector onset;
    NoteTracker tracker;
    Recording* recording = nullptr;
    std::vector<int> expected;
    std::vector<float> hann;     ///< Fenster fuer magnitudeAt (frameSize)
    std::vector<float> preOnset; ///< Analysefenster, das direkt vor dem letzten Anschlag endete
    bool havePreOnset = false;

    // Akkordpruefung: eigenes, laengeres Fenster (Frequenzaufloesung fuer tiefe Akkordtoene)
    int chordFrame = 0;               ///< 0 = kein Akkord erwartet
    int minChordFrame = 4096, maxChordFrame = 8192;
    std::vector<float> chordHann, chordPre;
    std::vector<int> chordTones;      ///< erwartete Toene beim Anschlag (bis zur Auswertung)
    double chordOnsetSec = 0.0;
    long long chordCheckAt = -1;      ///< Sample, ab dem ausgewertet wird (-1 = nichts offen)

    int hopSize = 256, frameSize = 2048, historySize = 2048;
    std::vector<float> history;   ///< die letzten historySize Samples, aeltestes zuerst
    int hopFill = 0;
    bool hopGateOpen = false;
    long long totalSamples = 0;   ///< Samples im Verlauf (Ende von history)
};

} // namespace ft
