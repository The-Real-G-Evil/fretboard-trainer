#pragma once

#include "audio/DetectionTuning.h"
#include "audio/NoteTracker.h"
#include "audio/OnsetDetector.h"
#include "audio/PitchDetector.h"

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

    struct Output
    {
        std::vector<PitchFrame> pitches;
        std::vector<double>     onsets;
        std::vector<NoteEvent>  notes;

        void clear() { pitches.clear(); onsets.clear(); notes.clear(); }
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
        Ein wirklich falsch gespielter Ton bleibt erhalten, weil dann dessen Teiltoene neu sind. */
    void setExpectedNotes (std::vector<int> midis) { expected = std::move (midis); }

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

private:
    void processHop (bool gateOpen, Output& out);
    void correctWithExpected (NoteEvent& ev) const noexcept;
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

    int hopSize = 256, frameSize = 2048, historySize = 2048;
    std::vector<float> history;   ///< die letzten historySize Samples, aeltestes zuerst
    int hopFill = 0;
    bool hopGateOpen = false;
    long long totalSamples = 0;   ///< Samples im Verlauf (Ende von history)
};

} // namespace ft
