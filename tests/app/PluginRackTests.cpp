// Tests des Plugin-Racks mit eingebauten Test-Prozessoren (ohne echte VST3-Dateien).

#include "app/PluginRack.h"

#include <catch2/catch_test_macros.hpp>

using namespace ft;

namespace
{
    struct TempDir
    {
        juce::File dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                             .getChildFile ("ft_rack_test_" + juce::String (juce::Random::getSystemRandom().nextInt64()));
        TempDir()  { dir.createDirectory(); }
        ~TempDir() { dir.deleteRecursively(); }
    };

    /** Verstaerkt (links/rechts getrennt einstellbar), meldet Latenz, speichert die Verstaerkung. */
    struct GainProcessor : juce::AudioProcessor
    {
        explicit GainProcessor (float g, int latency = 0, bool monoIn = false)
            : AudioProcessor (BusesProperties()
                                  .withInput ("In", monoIn ? juce::AudioChannelSet::mono() : juce::AudioChannelSet::stereo())
                                  .withOutput ("Out", juce::AudioChannelSet::stereo())),
              gain (g), monoOnly (monoIn)
        {
            setLatencySamples (latency);
        }

        const juce::String getName() const override { return "Gain"; }
        void prepareToPlay (double sr, int block) override { preparedRate = sr; preparedBlock = block; }
        void releaseResources() override {}
        void processBlock (juce::AudioBuffer<float>& b, juce::MidiBuffer&) override
        {
            if (getTotalNumInputChannels() == 1) // Mono rein: auf beide Ausgaenge
                b.copyFrom (1, 0, b, 0, 0, b.getNumSamples());
            b.applyGain (0, 0, b.getNumSamples(), gain);
            b.applyGain (1, 0, b.getNumSamples(), gain * rightFactor);
        }
        bool isBusesLayoutSupported (const BusesLayout& l) const override
        {
            return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
                && (! monoOnly || l.getMainInputChannelSet() == juce::AudioChannelSet::mono());
        }
        double getTailLengthSeconds() const override { return 0.0; }
        bool acceptsMidi() const override { return false; }
        bool producesMidi() const override { return false; }
        juce::AudioProcessorEditor* createEditor() override { return nullptr; }
        bool hasEditor() const override { return false; }
        int getNumPrograms() override { return 1; }
        int getCurrentProgram() override { return 0; }
        void setCurrentProgram (int) override {}
        const juce::String getProgramName (int) override { return {}; }
        void changeProgramName (int, const juce::String&) override {}
        void getStateInformation (juce::MemoryBlock& m) override { m.replaceAll (&gain, sizeof (gain)); }
        void setStateInformation (const void* d, int size) override
        {
            if (size == sizeof (gain))
                std::memcpy (&gain, d, sizeof (gain));
        }

        float gain = 1.0f, rightFactor = 1.0f;
        bool monoOnly = false;
        double preparedRate = 0.0;
        int preparedBlock = 0;
    };

    juce::PluginDescription desc (const juce::String& name)
    {
        juce::PluginDescription d;
        d.name = name;
        d.manufacturerName = "Test";
        d.pluginFormatName = "Intern";
        return d;
    }

    /** Wie der Audio-Thread: Schnappschuss uebernehmen und verarbeiten; danach abraeumen. */
    std::pair<float, float> run (PluginRack& rack, float l, float r)
    {
        std::vector<float> left (64, l), right (64, r);
        rack.processInsert (left.data(), right.data(), 64);
        rack.collectGarbage();
        return { left[10], right[10] };
    }
}

TEST_CASE ("Plugin-Rack: Kette verarbeitet in Reihenfolge, an/aus und Entfernen wirken")
{
    TempDir tmp;
    PluginRack rack (tmp.dir);
    rack.prepareInsert (48000.0, 256);

    CHECK (run (rack, 0.1f, 0.2f) == std::pair { 0.1f, 0.2f }); // leer: unveraendert

    auto first = std::make_unique<GainProcessor> (2.0f, 64);
    auto* firstPtr = first.get();
    rack.addProcessor (std::move (first), desc ("Zwei"));
    rack.addProcessor (std::make_unique<GainProcessor> (3.0f, 32, true), desc ("Drei mono"));
    CHECK (firstPtr->preparedRate == 48000.0);
    CHECK (firstPtr->preparedBlock == 256);

    {
        const auto [l, r] = run (rack, 0.1f, 0.2f);
        // nach dem ersten (x2): 0,2 / 0,4; der zweite hat nur einen Mono-Eingang: (0,2 + 0,4) / 2 * 3 auf beide Seiten
        CHECK (std::abs (l - 0.9f) < 1e-6f);
        CHECK (std::abs (r - 0.9f) < 1e-6f);
    }
    CHECK (rack.getLatencySamples() == 96);
    REQUIRE (rack.getSlots().size() == 2);
    CHECK (rack.getSlots()[1].name == "Drei mono");

    rack.setEnabled (1, false);
    CHECK (std::abs (run (rack, 0.1f, 0.1f).first - 0.2f) < 1e-6f);
    CHECK (rack.getLatencySamples() == 64);

    rack.move (1, -1);
    CHECK (rack.getSlots()[0].name == "Drei mono");
    rack.remove (0);
    REQUIRE (rack.getSlots().size() == 1);
    CHECK (std::abs (run (rack, 0.1f, 0.1f).first - 0.2f) < 1e-6f);
}

TEST_CASE ("Plugin-Rack: neue Abtastrate bereitet alle Plugins neu vor")
{
    TempDir tmp;
    PluginRack rack (tmp.dir);
    rack.prepareInsert (44100.0, 128);
    auto p = std::make_unique<GainProcessor> (1.0f);
    auto* ptr = p.get();
    rack.addProcessor (std::move (p), desc ("Eins"));
    rack.prepareInsert (96000.0, 512);
    CHECK (ptr->preparedRate == 96000.0);
    CHECK (ptr->preparedBlock == 512);
    std::vector<float> l (512, 0.5f), r (512, 0.5f);
    rack.processInsert (l.data(), r.data(), 512); // Puffer reicht fuer die neue Blockgroesse
    CHECK (l[500] == 0.5f);
}

TEST_CASE ("Plugin-Rack: gespeicherter Zustand enthaelt Beschreibung, Schalter und Plugin-Zustand")
{
    TempDir tmp;
    PluginRack rack (tmp.dir);
    rack.prepareInsert (48000.0, 256);
    int changes = 0;
    rack.onChange = [&changes] { ++changes; };
    rack.addProcessor (std::make_unique<GainProcessor> (4.5f), desc ("Viereinhalb"));
    rack.setEnabled (0, false);
    CHECK (changes == 2);

    const auto state = rack.saveState();
    REQUIRE (state.size() == 1);
    const auto item = state[0];
    CHECK_FALSE (static_cast<bool> (item.getProperty ("enabled", true)));
    juce::PluginDescription d;
    REQUIRE (d.loadFromXml (*juce::parseXML (item.getProperty ("desc", {}).toString())));
    CHECK (d.name == "Viereinhalb");
    juce::MemoryBlock mb;
    REQUIRE (mb.fromBase64Encoding (item.getProperty ("state", {}).toString()));
    GainProcessor restored (1.0f);
    restored.setStateInformation (mb.getData(), static_cast<int> (mb.getSize()));
    CHECK (restored.gain == 4.5f);
}
