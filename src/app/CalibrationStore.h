#pragma once

#include "audio/AnalysisWorker.h"
#include "audio/Calibration.h"

#include <juce_events/juce_events.h>

#include <functional>
#include <map>
#include <memory>

namespace ft
{

/** Kalibrier-Aufnahmen: Ablage, Auswertung und Optimierung der Erkennungsparameter.

    Ablage in <Datenordner>/calibration/, je Aufnahme drei Dateien:
        <id>.json  Beschreibung mit letzter Bewertung (wird beim Start eingelesen)
        <id>.wav   Aufnahme (Float 32 Bit)
        <id>.txt   erwartete Noten (Format wie tests/data)
    Es gibt bewusst keine gemeinsame Indexdatei: jede Aufnahme ist fuer sich vollstaendig.

    Rechenintensives laeuft in einem Hintergrund-Thread; Rueckrufe kommen auf dem
    Message-Thread an. Alle oeffentlichen Methoden nur vom Message-Thread aufrufen.
*/
class CalibrationStore
{
public:
    struct TakeInfo
    {
        juce::String instrument, exerciseId, title;
        juce::String kind = "notes"; ///< "notes" oder "silence"
        int level = 1;
        ExpectedNotes expected;
    };

    using Done = std::function<void (juce::var)>;
    using Progress = std::function<void (float)>;

    explicit CalibrationStore (const juce::File& dataDirectory);
    ~CalibrationStore();

    juce::var getTakes() const { return index; }

    /** Speichert die Aufnahme, bewertet sie und liefert den neuen Index-Eintrag. */
    void addTake (const TakeInfo& info, AnalysisWorker::RecordedAudio audio,
                  const NoiseGate::Parameters& gate, const DetectionTuning& tuning, Done done);

    bool removeTake (const juce::String& id);

    /** Bewertet alle Aufnahmen des Instruments neu (z. B. nach geaenderten Parametern); liefert den Index. */
    void evaluateAll (const juce::String& instrument, const NoiseGate::Parameters& gate,
                      const DetectionTuning& tuning, Done done);

    /** Sucht den besten Parametersatz ueber alle Noten-Aufnahmen des Instruments. */
    void optimise (const juce::String& instrument, const NoiseGate::Parameters& gate,
                   const DetectionTuning& current, Progress progress, Done done);

    bool isBusy() const noexcept { return busy.load() > 0; }

private:
    juce::File fileFor (const juce::String& id, const char* extension) const;
    void loadIndex();
    bool saveEntry (const juce::var& take) const;
    void runInBackground (std::function<std::function<void()> ()> work);

    /** Hintergrund-Thread: Aufnahme analysieren (mit Cache je Gate-Einstellung). */
    const CalibrationTake* getAnalysedTake (const juce::String& id, const ExpectedNotes& expected,
                                            const NoiseGate::Parameters& gate);

    juce::File directory;
    juce::var index;  ///< Array von Aufnahme-Objekten

    juce::ThreadPool pool { juce::ThreadPoolOptions{}.withNumberOfThreads (1).withThreadName ("Kalibrierung") };
    std::shared_ptr<std::atomic<bool>> alive = std::make_shared<std::atomic<bool>> (true);
    std::atomic<int> busy { 0 };

    juce::String cachedGateKey;
    std::map<juce::String, CalibrationTake> cache; ///< nur im Hintergrund-Thread benutzt
};

} // namespace ft
