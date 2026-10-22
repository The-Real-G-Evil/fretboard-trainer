#pragma once

#include "audio/AnalysisWorker.h"
#include "audio/NoiseGate.h"

#include <juce_events/juce_events.h>

#include <functional>
#include <memory>

namespace ft
{

/** Aufnahmen der Uebungsdurchgaenge und ihre Nachanalyse (SPEC: Aufnahme und Nachanalyse).

    Ablage in <Datenordner>/recordings/, je Durchgang:
        session-<id>.wav   Eingangssignal (16 Bit)
        session-<id>.json  erwartete Noten mit Live-Wertung, erkannte Noten, Ausrichtung, Endwert,
                           Huellkurve fuer die Wellenform
    Die Analyse laeuft in einem Hintergrund-Thread; Rueckrufe kommen auf dem Message-Thread an.
    Alle oeffentlichen Methoden nur vom Message-Thread aufrufen. */
class ReviewStore
{
public:
    struct Request
    {
        long long sessionId = 0;
        juce::String mode;
        double toleranceMs = 0.0; ///< 0: nur die Reihenfolge zaehlt
        juce::var items;          ///< [{ midis: [..], timeMs?: Stream-Uhr, live: "hit" | "miss" }]
        int liveHits = 0, liveMisses = 0;
    };

    using Done = std::function<void (juce::var)>;

    explicit ReviewStore (const juce::File& dataDirectory);
    ~ReviewStore();

    /** Speichert die Aufnahme, analysiert sie und liefert
        { sessionId, finalHits, finalTotal, liveHits, liveTotal } bzw. { error }. */
    void analyse (const Request& request, std::shared_ptr<const AnalysisWorker::RecordedAudio> audio,
                  const NoiseGate::Parameters& gate, const AnalysisWorker::DetectionConfig& detection, Done done);

    /** Ergebnis der Nachanalyse eines Durchgangs (void: keins). */
    juce::var load (long long sessionId) const;

    /** Ausschnitt der Aufnahme [fromSec, toSec), umgerechnet auf targetRate. */
    std::vector<float> loadClip (long long sessionId, double fromSec, double toSec, double targetRate);

    /** Behaelt die neuesten maxCount Aufnahmen, deren Durchgang es noch gibt. */
    void prune (const std::function<bool (long long)>& sessionExists, int maxCount);

    bool isBusy() const noexcept { return busy.load() > 0; }

private:
    juce::File fileFor (long long sessionId, const char* extension) const;

    juce::File directory;
    juce::ThreadPool pool { juce::ThreadPoolOptions{}.withNumberOfThreads (1).withThreadName ("Nachanalyse") };
    std::shared_ptr<std::atomic<bool>> alive = std::make_shared<std::atomic<bool>> (true);
    std::atomic<int> busy { 0 };

    // zuletzt angehoerte Aufnahme (Review: mehrere Stellen derselben Aufnahme)
    long long cachedId = -1;
    std::vector<float> cachedSamples;
    double cachedRate = 0.0;
};

} // namespace ft
