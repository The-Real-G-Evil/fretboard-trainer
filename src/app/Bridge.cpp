#include "app/Bridge.h"

#include "app/Settings.h"
#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    using Completion = juce::WebBrowserComponent::NativeFunctionCompletion;

    juce::var arg (const juce::Array<juce::var>& args, int index)
    {
        return juce::isPositiveAndBelow (index, args.size()) ? args[index] : juce::var();
    }

    float floatProp (const juce::var& obj, const char* name, float fallback)
    {
        const auto v = obj.getProperty (name, fallback);
        return v.isDouble() || v.isInt() || v.isInt64() ? static_cast<float> (static_cast<double> (v)) : fallback;
    }

    juce::var toVarArray (const juce::StringArray& strings)
    {
        juce::Array<juce::var> a;
        for (const auto& s : strings)
            a.add (s);
        return a;
    }

    template <typename T>
    juce::var toVarArray (const juce::Array<T>& values)
    {
        juce::Array<juce::var> a;
        for (auto v : values)
            a.add (v);
        return a;
    }
}

Bridge::Bridge (AudioEngine& e, Settings& s) : engine (e), settings (s)
{
}

juce::WebBrowserComponent::Options Bridge::registerFunctions (juce::WebBrowserComponent::Options options)
{
    return options
        .withNativeFunction ("getAudioDevices", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeDevices());
        })
        .withNativeFunction ("setAudioDevice", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto cfgVar = arg (args, 0);

            AudioEngine::DeviceConfig cfg;
            cfg.type         = cfgVar.getProperty ("type", {}).toString();
            cfg.inputDevice  = cfgVar.getProperty ("inputDevice", {}).toString();
            cfg.outputDevice = cfgVar.getProperty ("outputDevice", {}).toString();
            cfg.sampleRate   = static_cast<double> (cfgVar.getProperty ("sampleRate", 0.0));
            cfg.bufferSize   = static_cast<int> (cfgVar.getProperty ("bufferSize", 0));
            cfg.inputChannel = static_cast<int> (cfgVar.getProperty ("inputChannel", 0));

            const auto error = engine.setDeviceConfig (cfg);
            persistDeviceState();
            done (describeDevices (error));
        })
        .withNativeFunction ("setInputGain", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto db = juce::jlimit (-60.0f, 40.0f, static_cast<float> (static_cast<double> (arg (args, 0))));
            engine.setInputGainDb (db);
            settings.setInputGainDb (db);
            done ({});
        })
        .withNativeFunction ("setMonitoring", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto on = static_cast<bool> (arg (args, 0));
            const auto volumeDb = juce::jlimit (-100.0f, 12.0f, static_cast<float> (static_cast<double> (arg (args, 1))));
            engine.setMonitoring (on, volumeDb);
            settings.setMonitoring (on, volumeDb);
            done ({});
        })
        .withNativeFunction ("setNoiseGate", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            auto p = settings.getNoiseGate();
            p.thresholdDb  = juce::jlimit (-100.0f, 0.0f,   floatProp (obj, "thresholdDb",  p.thresholdDb));
            p.attackMs     = juce::jlimit (0.0f,    500.0f, floatProp (obj, "attackMs",     p.attackMs));
            p.holdMs       = juce::jlimit (0.0f,   2000.0f, floatProp (obj, "holdMs",       p.holdMs));
            p.releaseMs    = juce::jlimit (0.0f,   5000.0f, floatProp (obj, "releaseMs",    p.releaseMs));
            p.hysteresisDb = juce::jlimit (0.0f,     40.0f, floatProp (obj, "hysteresisDb", p.hysteresisDb));
            engine.setNoiseGate (p);
            settings.setNoiseGate (p);
            done ({});
        })
        .withNativeFunction ("getSettings", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeSettings());
        });
}

void Bridge::persistDeviceState()
{
    const auto xml = engine.createDeviceStateXml();
    settings.setAudioDeviceState (xml.get());
}

juce::var Bridge::describeDevices (const juce::String& error)
{
    auto& dm = engine.getDeviceManager();

    juce::Array<juce::var> types;
    for (auto* type : dm.getAvailableDeviceTypes())
    {
        if (scannedTypes.insert (type->getTypeName()).second)
            type->scanForDevices();

        auto* t = new juce::DynamicObject();
        t->setProperty ("name", type->getTypeName());
        t->setProperty ("inputs", toVarArray (type->getDeviceNames (true)));
        t->setProperty ("outputs", toVarArray (type->getDeviceNames (false)));
        t->setProperty ("separateInputsAndOutputs", type->hasSeparateInputsAndOutputs());
        types.add (juce::var (t));
    }

    const auto cfg = engine.getDeviceConfig();
    auto* current = new juce::DynamicObject();
    current->setProperty ("type", cfg.type);
    current->setProperty ("inputDevice", cfg.inputDevice);
    current->setProperty ("outputDevice", cfg.outputDevice);
    current->setProperty ("sampleRate", cfg.sampleRate);
    current->setProperty ("bufferSize", cfg.bufferSize);
    current->setProperty ("inputChannel", cfg.inputChannel);

    auto* result = new juce::DynamicObject();
    result->setProperty ("types", types);
    result->setProperty ("current", juce::var (current));

    if (auto* device = dm.getCurrentAudioDevice())
    {
        result->setProperty ("inputChannels", toVarArray (device->getInputChannelNames()));
        result->setProperty ("sampleRates", toVarArray (device->getAvailableSampleRates()));
        result->setProperty ("bufferSizes", toVarArray (device->getAvailableBufferSizes()));
        result->setProperty ("latencyMs", 1000.0 * (device->getInputLatencyInSamples()
                                                    + device->getOutputLatencyInSamples()
                                                    + 2 * device->getCurrentBufferSizeSamples())
                                             / juce::jmax (1.0, device->getCurrentSampleRate()));
    }
    else
    {
        result->setProperty ("inputChannels", juce::Array<juce::var>());
        result->setProperty ("sampleRates", juce::Array<juce::var>());
        result->setProperty ("bufferSizes", juce::Array<juce::var>());
    }

    result->setProperty ("error", error);
    return juce::var (result);
}

juce::var Bridge::describeSettings() const
{
    const auto gate = settings.getNoiseGate();

    auto* g = new juce::DynamicObject();
    g->setProperty ("thresholdDb", gate.thresholdDb);
    g->setProperty ("attackMs", gate.attackMs);
    g->setProperty ("holdMs", gate.holdMs);
    g->setProperty ("releaseMs", gate.releaseMs);
    g->setProperty ("hysteresisDb", gate.hysteresisDb);

    auto* m = new juce::DynamicObject();
    m->setProperty ("on", settings.getMonitoringOn());
    m->setProperty ("volumeDb", settings.getMonitorVolumeDb());

    auto* result = new juce::DynamicObject();
    result->setProperty ("inputGainDb", settings.getInputGainDb());
    result->setProperty ("monitoring", juce::var (m));
    result->setProperty ("noiseGate", juce::var (g));
    return juce::var (result);
}

} // namespace ft
