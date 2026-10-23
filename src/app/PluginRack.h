#pragma once

#include "audio/AudioInsert.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <vector>

namespace ft
{

/** VST3-Effekte im Mithoer-Weg (Phase 9: VST3-Hosting), nach den eigenen Effekten.

    - Plugin-Liste: Suche in den ueblichen VST3-Ordnern (Hintergrund-Thread), Ergebnis in
      <Datenordner>/plugins.xml; ein Plugin, das die Suche abstuerzen laesst, steht beim naechsten
      Mal auf der Sperrliste.
    - Kette: beliebig viele Plugins in Reihe, je Plugin an/aus; Zustand (Preset im Plugin) wird
      gespeichert und beim Start wiederhergestellt.
    - Audio: der Audio-Thread arbeitet auf einem unveraenderlichen Schnappschuss der Kette, den der
      Message-Thread austauscht; Plugins werden nur auf dem Message-Thread erzeugt und zerstoert.

    Oeffentliche Methoden (ausser prepareInsert/processInsert) nur vom Message-Thread. */
class PluginRack : public AudioInsert,
                   private juce::Timer
{
public:
    struct SlotInfo
    {
        juce::String name, vendor;
        bool enabled = true;
        int latencySamples = 0;
        bool hasEditor = false;
    };

    explicit PluginRack (const juce::File& dataDirectory);
    ~PluginRack() override;

    // ---------- Plugin-Liste
    /** Gefundene Effekt-Plugins (ohne Instrumente). */
    juce::Array<juce::PluginDescription> getAvailable() const;
    bool hasScanned() const noexcept { return scanned; }
    bool isScanning() const noexcept { return scanning.load(); }
    /** Sucht in den VST3-Standardordnern; progress(0..1, aktuelle Datei), done() auf dem Message-Thread. */
    void scan (std::function<void (float, juce::String)> progress, std::function<void()> done);

    // ---------- Kette
    /** Laedt ein Plugin der Liste (id = PluginDescription::createIdentifierString) ans Ende der Kette. */
    void add (const juce::String& id, std::function<void (juce::String error)> done);
    /** Fuer Tests und eingebaute Prozessoren: fertigen Prozessor einsetzen. */
    void addProcessor (std::unique_ptr<juce::AudioProcessor> processor, const juce::PluginDescription& desc);
    void remove (int slot);
    void move (int slot, int delta);
    void setEnabled (int slot, bool enabled);
    /** Oeffnet die Oberflaeche des Plugins in einem eigenen Fenster (bzw. holt es nach vorn). */
    void openEditor (int slot);
    std::vector<SlotInfo> getSlots() const;
    /** Gesamte Latenz der eingeschalteten Plugins in Samples. */
    int getLatencySamples() const;

    /** [{ desc (XML), enabled, state (Base64) }] */
    juce::var saveState() const;
    /** Laedt die gespeicherte Kette (nacheinander, asynchron); done() wenn alle geladen sind. */
    void restoreState (const juce::var& state, std::function<void()> done = {});
    /** Wird aufgerufen, wenn sich etwas Speichernswertes geaendert hat (Kette, Plugin-Fenster geschlossen). */
    std::function<void()> onChange;

    /** Ausgemusterte Schnappschuesse freigeben (Message-Thread; laeuft auch per Timer). */
    void collectGarbage();

    // ---------- AudioInsert
    void prepareInsert (double sampleRate, int maxBlockSize) override;
    void processInsert (float* left, float* right, int numSamples) noexcept override;

private:
    struct EditorWindow;

    struct Slot
    {
        std::shared_ptr<juce::AudioProcessor> processor;
        juce::PluginDescription desc;
        bool enabled = true;
        std::unique_ptr<EditorWindow> window;
    };

    struct Entry
    {
        juce::AudioProcessor* processor = nullptr;
        int inputs = 2, outputs = 2;
    };

    struct Snapshot
    {
        std::vector<Entry> entries;
        std::vector<std::shared_ptr<juce::AudioProcessor>> keepAlive;
        juce::AudioBuffer<float> buffer;
        juce::MidiBuffer midi;
    };

    void timerCallback() override { collectGarbage(); }
    void prepareProcessor (juce::AudioProcessor& p);
    void insertSlot (std::shared_ptr<juce::AudioProcessor> processor, const juce::PluginDescription& desc, bool enabled);
    void publish();
    void changed() { if (onChange) onChange(); }
    void saveList() const;

    juce::File listFile, crashFile;
    juce::AudioPluginFormatManager formats;
    juce::KnownPluginList known;
    bool scanned = false;
    std::atomic<bool> scanning { false };

    std::vector<Slot> slots;

    std::mutex prepareLock; // Abtastrate/Blockgroesse und Schnappschuss-Aufbau (nie im Audio-Thread)
    double rate = 48000.0;
    int blockSize = 512;
    std::vector<Snapshot*> graveyard;

    std::atomic<Snapshot*> pending { nullptr }, retired { nullptr };
    Snapshot* current = nullptr; // nur Audio-Thread

    std::shared_ptr<std::atomic<bool>> alive = std::make_shared<std::atomic<bool>> (true);
};

} // namespace ft
