#pragma once

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
*/
class Analyzer
{
public:
    struct Config
    {
        double sampleRate = 48000.0;
        float  minHz = 55.0f;
        float  maxHz = 1500.0f;
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

    /** Alloziert. */
    void prepare (const Config& config);
    const Config& getConfig() const noexcept { return cfg; }

    /** gateOpen: Zustand des Noisegates fuer diese Samples. Bei geschlossenem Gate
        wird keine Tonhoehe gemeldet und kein Anschlag erkannt. */
    void process (const float* samples, int numSamples, bool gateOpen, Output& out);

    /** Latenz bis zum ersten auswertbaren Frame nach einem Anschlag (Fensterlaenge). */
    double getFrameDurationSec() const noexcept { return frameSize / cfg.sampleRate; }

private:
    void processHop (bool gateOpen, Output& out);

    Config cfg;
    PitchDetector pitch;
    OnsetDetector onset;
    NoteTracker tracker;

    int hopSize = 256, frameSize = 2048, historySize = 2048;
    std::vector<float> history;   ///< die letzten historySize Samples, aeltestes zuerst
    int hopFill = 0;
    bool hopGateOpen = false;
    long long totalSamples = 0;   ///< Samples im Verlauf (Ende von history)
};

} // namespace ft
