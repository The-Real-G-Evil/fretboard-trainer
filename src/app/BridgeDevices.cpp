// Geraeteueberwachung der Bridge: Hot-Plug, Rocksmith Real Tone Cable, Gain je Eingangsgeraet.

#include "app/Bridge.h"
#include "app/Settings.h"

#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    /** Startwert des Eingangsgains beim ersten Einsatz des Kabels (danach gilt der eigene Wert). */
    constexpr float cableStartGainDb = 0.0f;

    bool isCable (const juce::String& name)
    {
        return name.containsIgnoreCase ("rocksmith") || name.containsIgnoreCase ("real tone");
    }

    juce::String findCable (const juce::StringArray& inputs)
    {
        for (const auto& name : inputs)
            if (isCable (name))
                return name;
        return {};
    }
}

void Bridge::emitDeviceEvent (const juce::String& state, const juce::String& device, const juce::String& fallback,
                              bool withGain, bool firstUse)
{
    if (! emitEvent)
        return;

    auto* o = new juce::DynamicObject();
    o->setProperty ("state", state);
    o->setProperty ("device", device);
    if (fallback.isNotEmpty())
        o->setProperty ("fallback", fallback);
    if (withGain)
        o->setProperty ("gainDb", settings.getInputGainDb());
    if (firstUse)
        o->setProperty ("firstUse", true);
    emitEvent ("audioDevice", juce::var (o));
}

juce::String Bridge::applyDeviceConfig (const AudioEngine::DeviceConfig& cfg)
{
    const auto before = engine.getDeviceConfig().inputDevice;
    if (before.isNotEmpty())
        settings.setDeviceGainDb (before, settings.getInputGainDb());

    const auto error = engine.setDeviceConfig (cfg);
    persistDeviceState();

    const auto after = engine.getDeviceConfig().inputDevice;
    if (after.isNotEmpty() && after != before)
    {
        // Jedes Eingangsgeraet hat seinen eigenen Pegel; neues Kabel: fester Startwert
        const auto fallback = isCable (after) ? cableStartGainDb : settings.getInputGainDb();
        const auto db = settings.getDeviceGainDb (after, fallback);
        engine.setInputGainDb (db);
        settings.setInputGainDb (db);
        settings.setDeviceGainDb (after, db);
    }
    return error;
}

juce::String Bridge::switchInput (const juce::String& device, int channel)
{
    auto cfg = engine.getDeviceConfig();
    cfg.inputDevice = device;
    cfg.inputChannel = channel;
    return applyDeviceConfig (cfg);
}

juce::String Bridge::useCable (const juce::String& device)
{
    const auto cfg = engine.getDeviceConfig();
    if (! isCable (cfg.inputDevice))
    {
        inputBeforeCable = cfg.inputDevice;
        channelBeforeCable = cfg.inputChannel;
    }

    // Voreinstellung: Kanal 1 (das Kabel ist mono); Ausgang moeglichst auf 48 kHz wie das Kabel,
    // dann rechnet der Taktausgleich nur die Drift heraus und keine andere Nennrate
    auto next = cfg;
    next.inputDevice = device;
    next.inputChannel = 0;
    if (auto* out = engine.getDeviceManager().getCurrentAudioDevice())
        if (out->getAvailableSampleRates().contains (48000.0))
            next.sampleRate = 48000.0;

    pendingCable.clear();
    dismissedCable.clear();
    return applyDeviceConfig (next);
}

juce::var Bridge::describeCableState() const
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("pending", pendingCable);
    o->setProperty ("auto", static_cast<bool> (settings.getUiSettings().getProperty ("rocksmith.auto", false)));
    o->setProperty ("active", isCable (engine.getDeviceConfig().inputDevice) && engine.isSplitInput());
    return juce::var (o);
}

void Bridge::timerCallback()
{
    auto& dm = engine.getDeviceManager();
    auto* type = dm.getCurrentDeviceTypeObject();
    if (type == nullptr)
        return;

    // Geraeteliste neu einlesen: nicht jeder Treiber meldet Aenderungen selbst
    type->scanForDevices();
    const auto inputs = type->getDeviceNames (true);
    const auto outputs = type->getDeviceNames (false);
    const auto listChanged = devicesInitialised && (inputs != lastInputs || outputs != lastOutputs);
    const auto cable = findCable (inputs);
    const auto cableIsNew = cable.isNotEmpty() && (! devicesInitialised || ! lastInputs.contains (cable));
    lastInputs = inputs;
    lastOutputs = outputs;
    devicesInitialised = true;

    const auto cfg = engine.getDeviceConfig();
    const auto inputPresent = cfg.inputDevice.isEmpty() || inputs.contains (cfg.inputDevice);

    if (pendingCable.isNotEmpty() && ! inputs.contains (pendingCable))
    {
        pendingCable.clear();
        emitDeviceEvent ("cableGone", {});
    }
    if (dismissedCable.isNotEmpty() && ! inputs.contains (dismissedCable))
        dismissedCable.clear(); // beim naechsten Einstecken wieder fragen

    if (! inputPresent)
    {
        // Gewaehlter Eingang abgezogen: auf den vorherigen bzw. den Standard-Eingang ausweichen
        lostInput = cfg.inputDevice;
        lostChannel = cfg.inputChannel;

        auto fallback = isCable (lostInput) && inputs.contains (inputBeforeCable) ? inputBeforeCable : juce::String();
        auto fallbackChannel = fallback.isNotEmpty() ? channelBeforeCable : 0;
        if (fallback.isEmpty() && ! inputs.isEmpty())
            fallback = inputs[juce::jmax (0, type->getDefaultDeviceIndex (true))];

        if (fallback.isNotEmpty())
            switchInput (fallback, fallbackChannel);
        emitDeviceEvent ("inputLost", lostInput, fallback, true);
        return;
    }

    if (lostInput.isNotEmpty() && inputs.contains (lostInput))
    {
        // Wieder eingesteckt: zurueckwechseln, ohne zu fragen (war ja schon gewaehlt)
        const auto device = lostInput;
        lostInput.clear();
        if (isCable (device))
            useCable (device);
        else
            switchInput (device, lostChannel);
        emitDeviceEvent ("inputRestored", device, {}, true);
        return;
    }

    // Ausgang war weg: JUCE oeffnet dann Standardgeraete, auch einen Eingang -> getrennten Eingang wiederherstellen
    const auto managerTookInput = engine.isSplitSelected() && dm.getAudioDeviceSetup().inputDeviceName.isNotEmpty();

    if ((engine.hasSplitInputFailed() || managerTookInput) && cfg.inputDevice.isNotEmpty())
    {
        // Geraet noch gelistet, aber ausgestiegen (z. B. kurz getrennt): neu oeffnen
        switchInput (cfg.inputDevice, cfg.inputChannel);
        return;
    }

    if (cableIsNew && ! isCable (cfg.inputDevice) && cable != dismissedCable)
    {
        if (static_cast<bool> (settings.getUiSettings().getProperty ("rocksmith.auto", false)))
        {
            const auto firstUse = ! settings.hasDeviceGain (cable);
            useCable (cable);
            emitDeviceEvent ("switched", cable, {}, true, firstUse);
        }
        else
        {
            pendingCable = cable;
            emitDeviceEvent ("cableDetected", cable);
        }
        return;
    }

    if (listChanged)
        emitDeviceEvent ("listChanged", {});
}

} // namespace ft
