// Geraeteueberwachung der Bridge: Audiogeraete ein- und ausstecken, Pegel je Eingangsgeraet.
// Nach der Idee aus dem Rocksmith-Kabel-Beitrag von Philipp (softyde), verallgemeinert auf jedes Geraet.

#include "app/Bridge.h"
#include "app/Settings.h"

#include "audio/AudioEngine.h"

#include <regex>
#include <utility>

namespace ft
{

namespace
{
    /** Startpegel eines Eingangsgeraets ohne gemerkten Wert (USB-Kabel wie das Rocksmith-Kabel liefern bereits
        einen kraeftigen Pegel; der Wert des vorherigen Interfaces wuerde sie uebersteuern). */
    constexpr float newDeviceGainDb = 0.0f;

    /** Dasselbe Geraet in der Liste, auch wenn Windows es beim Wiedereinstecken neu nummeriert hat. */
    juce::String findSame (const juce::StringArray& list, const juce::String& name)
    {
        if (name.isEmpty() || list.contains (name))
            return name.isEmpty() ? juce::String() : name;
        const auto stable = Bridge::stableDeviceName (name);
        for (const auto& n : list)
            if (Bridge::stableDeviceName (n) == stable)
                return n;
        return {};
    }

    bool sameDevice (const juce::String& a, const juce::String& b)
    {
        return a.isNotEmpty() && Bridge::stableDeviceName (a) == Bridge::stableDeviceName (b);
    }

    /** Neu aufgetauchte Namen (in now, nicht in before). */
    juce::StringArray added (const juce::StringArray& now, const juce::StringArray& before)
    {
        juce::StringArray result;
        for (const auto& name : now)
            if (! before.contains (name))
                result.add (name);
        return result;
    }
}

juce::String Bridge::stableDeviceName (const juce::String& name)
{
    // Windows haengt bei wiederholt eingesteckten USB-Geraeten eine laufende Nummer an:
    // "Mikrofon (2- Rocksmith USB Guitar Adapter)" -> "Mikrofon (Rocksmith USB Guitar Adapter)"
    static const std::regex counter (R"((\()\d+- |^\d+- )"); // Gruppe 1: die Klammer bleibt stehen
    return juce::String::fromUTF8 (std::regex_replace (name.toStdString(), counter, "$1").c_str());
}

bool Bridge::deviceWatchEnabled() const
{
    return static_cast<bool> (settings.getUiSettings().getProperty ("devices.watch", true));
}

void Bridge::emitDeviceEvent (const juce::String& state, const juce::String& device, const juce::String& fallback,
                              bool firstUse, int fromChannel, int toChannel)
{
    if (! emitEvent)
        return;

    auto* o = new juce::DynamicObject();
    o->setProperty ("state", state);
    o->setProperty ("device", device);
    if (fallback.isNotEmpty())
        o->setProperty ("fallback", fallback);
    if (firstUse)
        o->setProperty ("firstUse", true);
    if (fromChannel >= 0)
        o->setProperty ("from", fromChannel);
    if (toChannel >= 0)
        o->setProperty ("to", toChannel);
    emitEvent ("audioDevice", juce::var (o));
}

juce::String Bridge::applyDeviceConfig (const AudioEngine::DeviceConfig& cfg)
{
    const auto before = engine.getDeviceConfig().inputDevice;
    if (before.isNotEmpty())
        settings.setDeviceGainDb (stableDeviceName (before), settings.getInputGainDb());

    const auto error = engine.setDeviceConfig (cfg);
    persistDeviceState();

    const auto current = engine.getDeviceConfig();
    const auto after = current.inputDevice;
    if (after.isNotEmpty() && error.isEmpty())
        settings.setDeviceChannel (stableDeviceName (after), current.inputChannel); // gewaehlter Kanal je Geraet
    if (after.isNotEmpty() && ! sameDevice (after, before))
    {
        // Jedes Eingangsgeraet hat seinen eigenen Pegel; ein neues startet mit 0 dB
        const auto key = stableDeviceName (after);
        const auto db = settings.getDeviceGainDb (key, newDeviceGainDb);
        engine.setInputGainDb (db);
        settings.setInputGainDb (db);
        settings.setDeviceGainDb (key, db);
    }
    if (after.isNotEmpty() && ! sameDevice (after, before) && error.isEmpty())
        checkChannels();
    return error;
}

void Bridge::checkChannels()
{
    const auto cfg = engine.getDeviceConfig();
    auto* type = engine.getDeviceManager().getCurrentDeviceTypeObject();
    // Nur wo sich ein Geraet ein zweites Mal oeffnen laesst (Windows Audio, DirectSound, CoreAudio); ASIO nicht
    if (cfg.inputDevice.isEmpty() || type == nullptr || ! type->hasSeparateInputsAndOutputs()
        || settings.isDeviceChannelManual (stableDeviceName (cfg.inputDevice)))
        return;

    channelCheck.start (*type, cfg.inputDevice, [this] (const juce::String& device, const std::vector<bool>& faulty)
    {
        auto now = engine.getDeviceConfig();
        const auto ch = now.inputChannel;
        if (now.inputDevice != device || ch < 0 || ch >= static_cast<int> (faulty.size()) || ! faulty[static_cast<size_t> (ch)])
            return; // inzwischen gewechselt oder Kanal sauber

        for (int i = 0; i < static_cast<int> (faulty.size()); ++i)
            if (! faulty[static_cast<size_t> (i)])
            {
                now.inputChannel = i;
                if (applyDeviceConfig (now).isEmpty())
                    emitDeviceEvent ("channelSwitched", device, {}, false, ch, i);
                return;
            }
    });
}

juce::String Bridge::switchInput (const juce::String& device, int channel, const juce::String& output)
{
    auto cfg = engine.getDeviceConfig();
    cfg.inputDevice = device;
    // Kanal: der fuer dieses Geraet gemerkte, sonst der uebergebene
    cfg.inputChannel = settings.getDeviceChannel (stableDeviceName (device), channel);
    if (output.isNotEmpty())
        cfg.outputDevice = output;
    return applyDeviceConfig (cfg);
}

juce::String Bridge::useNewDevice()
{
    const auto cfg = engine.getDeviceConfig();
    inputBeforeSwitch = cfg.inputDevice;
    channelBeforeSwitch = cfg.inputChannel;

    auto* type = engine.getDeviceManager().getCurrentDeviceTypeObject();
    const bool separate = type != nullptr && type->hasSeparateInputsAndOutputs();
    // Treiber ohne getrennte Listen (z. B. ASIO): ein Geraet fuer beides; sonst den mit eingesteckten Ausgang
    const auto output = separate ? pendingOutput : pendingDevice;
    const auto device = pendingDevice;
    pendingDevice.clear();
    pendingOutput.clear();
    dismissedDevice.clear();
    return switchInput (device, 0, output);
}

juce::var Bridge::describeDeviceNotice() const
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("pending", pendingDevice);
    o->setProperty ("watch", deviceWatchEnabled());
    return juce::var (o);
}

void Bridge::timerCallback()
{
    if (std::exchange (startupChannelCheck, false))
        checkChannels(); // beim Start geoeffneten Eingang einmal pruefen

    if (! deviceWatchEnabled())
    {
        // abgeschaltet: Treiber nicht abfragen, nichts vorschlagen, nicht selbst wechseln; beim Einschalten
        // gilt die dann vorhandene Liste als Ausgangsstand
        devicesInitialised = false;
        pendingDevice.clear();
        lostInput.clear();
        return;
    }

    auto& dm = engine.getDeviceManager();
    auto* type = dm.getCurrentDeviceTypeObject();
    if (type == nullptr)
        return;

    // Geraeteliste neu einlesen: nicht jeder Treiber meldet Aenderungen selbst
    type->scanForDevices();
    const auto inputs = type->getDeviceNames (true);
    const auto outputs = type->getDeviceNames (false);
    const auto wasInitialised = devicesInitialised;
    const auto newInputs = added (inputs, lastInputs);
    const auto newOutputs = added (outputs, lastOutputs);
    const auto listChanged = wasInitialised && (inputs != lastInputs || outputs != lastOutputs);
    lastInputs = inputs;
    lastOutputs = outputs;
    devicesInitialised = true;

    const auto cfg = engine.getDeviceConfig();
    const auto inputPresent = cfg.inputDevice.isEmpty() || inputs.contains (cfg.inputDevice);

    if (pendingDevice.isNotEmpty() && findSame (inputs, pendingDevice).isEmpty())
    {
        pendingDevice.clear();
        emitDeviceEvent ("deviceGone", {});
    }
    if (dismissedDevice.isNotEmpty() && findSame (inputs, dismissedDevice).isEmpty())
        dismissedDevice.clear(); // beim naechsten Einstecken wieder fragen

    // Gewaehlter Eingang nur von Windows umbenannt (neue Nummer, z. B. nach dem Neustart): still uebernehmen
    if (! inputPresent)
        if (const auto renamed = findSame (inputs, cfg.inputDevice); renamed.isNotEmpty())
        {
            switchInput (renamed, cfg.inputChannel, type->hasSeparateInputsAndOutputs() ? juce::String() : renamed);
            return;
        }

    if (! inputPresent)
    {
        // Gewaehlter Eingang abgezogen: auf den vorherigen bzw. den Standard-Eingang ausweichen
        lostInput = cfg.inputDevice;
        lostChannel = cfg.inputChannel;

        auto fallback = findSame (inputs, inputBeforeSwitch);
        auto fallbackChannel = fallback.isNotEmpty() ? channelBeforeSwitch : 0;
        if (fallback.isEmpty() && ! inputs.isEmpty())
            fallback = inputs[juce::jmax (0, type->getDefaultDeviceIndex (true))];

        if (fallback.isNotEmpty())
            switchInput (fallback, fallbackChannel, type->hasSeparateInputsAndOutputs() ? juce::String() : fallback);
        emitDeviceEvent ("inputLost", lostInput, fallback);
        return;
    }

    if (const auto back = findSame (inputs, lostInput); back.isNotEmpty())
    {
        // Wieder eingesteckt (evtl. mit neuer Nummer): zurueckwechseln, ohne zu fragen (war ja schon gewaehlt)
        const auto device = back;
        lostInput.clear();
        switchInput (device, lostChannel, type->hasSeparateInputsAndOutputs() ? juce::String() : device);
        emitDeviceEvent ("inputRestored", device);
        return;
    }

    // Ausgang war weg: JUCE oeffnet dann Standardgeraete, auch einen Eingang -> getrennten Eingang wiederherstellen
    const auto managerTookInput = engine.isSplitSelected() && dm.getAudioDeviceSetup().inputDeviceName.isNotEmpty();
    if ((engine.hasSplitInputFailed() || managerTookInput) && cfg.inputDevice.isNotEmpty())
    {
        switchInput (cfg.inputDevice, cfg.inputChannel);
        return;
    }

    // Neu eingestecktes Geraet: als Eingang vorschlagen (nicht beim Start der App)
    if (wasInitialised)
        for (const auto& name : newInputs)
        {
            if (sameDevice (name, cfg.inputDevice) || sameDevice (name, dismissedDevice))
                continue;
            pendingDevice = name;
            // Kam genau ein Ausgang mit dazu, gehoert er vermutlich zum selben Interface
            pendingOutput = newOutputs.size() == 1 ? newOutputs[0] : juce::String();
            emitDeviceEvent ("deviceDetected", name, {}, ! settings.hasDeviceGain (stableDeviceName (name)));
            return;
        }

    if (listChanged)
        emitDeviceEvent ("listChanged", {});
}

} // namespace ft
