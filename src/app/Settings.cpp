#include "app/Settings.h"

namespace ft
{

namespace
{
    juce::PropertiesFile::Options makeOptions()
    {
        juce::PropertiesFile::Options o;
        o.applicationName          = "settings";
        o.filenameSuffix           = ".xml";
       #if JUCE_LINUX || JUCE_BSD
        o.folderName               = ".config/FretboardTrainer"; // JUCE legt sonst ~/FretboardTrainer an
       #else
        o.folderName               = "FretboardTrainer";
       #endif
        o.osxLibrarySubFolder      = "Application Support";
        o.storageFormat            = juce::PropertiesFile::storeAsXML;
        o.millisecondsBeforeSaving = 500;
        return o;
    }

    /** Einstellungsdatei; mit der Umgebungsvariable FT_DATA_DIR in einem eigenen Ordner (Tests, die
        die Daten des Nutzers nicht anfassen sollen). */
    juce::File settingsFile()
    {
        const auto dir = juce::SystemStats::getEnvironmentVariable ("FT_DATA_DIR", {}).trim();
        if (dir.isEmpty() || ! juce::File::isAbsolutePath (dir))
            return makeOptions().getDefaultFile();

        const juce::File folder (dir);
        folder.createDirectory();
        return folder.getChildFile ("settings.xml");
    }

    float getFloat (const juce::PropertiesFile& p, const char* key, float fallback)
    {
        return static_cast<float> (p.getDoubleValue (key, fallback));
    }
}

Settings::Settings() : props (settingsFile(), makeOptions())
{
}

std::unique_ptr<juce::XmlElement> Settings::getAudioDeviceState() const
{
    return props.getXmlValue ("audioDevice");
}

void Settings::setAudioDeviceState (const juce::XmlElement* xml)
{
    props.setValue ("audioDevice", xml);
}

float Settings::getInputGainDb() const       { return getFloat (props, "inputGainDb", 0.0f); }
void  Settings::setInputGainDb (float db)    { props.setValue ("inputGainDb", db); }

bool  Settings::getMonitoringOn() const      { return props.getBoolValue ("monitoringOn", true); }
float Settings::getMonitorVolumeDb() const   { return getFloat (props, "monitorVolumeDb", -6.0f); }

void Settings::setMonitoring (bool on, float volumeDb)
{
    props.setValue ("monitoringOn", on);
    props.setValue ("monitorVolumeDb", volumeDb);
}

namespace
{
    // Felder der Effektparameter mit ihren Namen im JSON
    struct FloatField { const char* name; float EffectParameters::* member; };
    struct BoolField { const char* name; bool EffectParameters::* member; };

    constexpr FloatField effectFloats[] = {
        { "compThresholdDb", &EffectParameters::compThresholdDb }, { "compRatio", &EffectParameters::compRatio },
        { "compAttackMs", &EffectParameters::compAttackMs }, { "compReleaseMs", &EffectParameters::compReleaseMs },
        { "compMakeupDb", &EffectParameters::compMakeupDb },
        { "driveDb", &EffectParameters::driveDb }, { "driveTone", &EffectParameters::driveTone },
        { "driveLevelDb", &EffectParameters::driveLevelDb }, { "driveBlend", &EffectParameters::driveBlend },
        { "eqBassDb", &EffectParameters::eqBassDb }, { "eqMidDb", &EffectParameters::eqMidDb },
        { "eqMidHz", &EffectParameters::eqMidHz }, { "eqTrebleDb", &EffectParameters::eqTrebleDb },
        { "chorusRateHz", &EffectParameters::chorusRateHz }, { "chorusDepthMs", &EffectParameters::chorusDepthMs },
        { "chorusMix", &EffectParameters::chorusMix },
        { "delayMs", &EffectParameters::delayMs }, { "delayFeedback", &EffectParameters::delayFeedback },
        { "delayMix", &EffectParameters::delayMix },
        { "reverbSize", &EffectParameters::reverbSize }, { "reverbDamping", &EffectParameters::reverbDamping },
        { "reverbMix", &EffectParameters::reverbMix },
    };
    constexpr BoolField effectBools[] = {
        { "compressorOn", &EffectParameters::compressorOn }, { "driveOn", &EffectParameters::driveOn },
        { "eqOn", &EffectParameters::eqOn }, { "chorusOn", &EffectParameters::chorusOn },
        { "delayOn", &EffectParameters::delayOn }, { "reverbOn", &EffectParameters::reverbOn },
    };
}

juce::var effectsToVar (const EffectParameters& p)
{
    auto* o = new juce::DynamicObject();
    for (const auto& f : effectFloats)
        o->setProperty (f.name, p.*(f.member));
    for (const auto& f : effectBools)
        o->setProperty (f.name, p.*(f.member));
    o->setProperty ("driveMode", p.driveMode);
    return juce::var (o);
}

EffectParameters effectsFromVar (const juce::var& v, const EffectParameters& fallback)
{
    auto p = fallback;
    if (! v.isObject())
        return p;
    for (const auto& f : effectFloats)
        if (v.hasProperty (f.name))
            p.*(f.member) = static_cast<float> (v.getProperty (f.name, 0.0));
    for (const auto& f : effectBools)
        if (v.hasProperty (f.name))
            p.*(f.member) = static_cast<bool> (v.getProperty (f.name, false));
    if (v.hasProperty ("driveMode"))
        p.driveMode = static_cast<int> (v.getProperty ("driveMode", 0));
    return p.clamped();
}

EffectParameters Settings::getEffects() const
{
    return effectsFromVar (juce::JSON::fromString (props.getValue ("effects")));
}

void Settings::setEffects (const EffectParameters& p)
{
    props.setValue ("effects", juce::JSON::toString (effectsToVar (p), true));
}

NoiseGate::Parameters Settings::getNoiseGate() const
{
    const NoiseGate::Parameters d;
    NoiseGate::Parameters p;
    p.thresholdDb  = getFloat (props, "gateThresholdDb",  d.thresholdDb);
    p.attackMs     = getFloat (props, "gateAttackMs",     d.attackMs);
    p.holdMs       = getFloat (props, "gateHoldMs",       d.holdMs);
    p.releaseMs    = getFloat (props, "gateReleaseMs",    d.releaseMs);
    p.hysteresisDb = getFloat (props, "gateHysteresisDb", d.hysteresisDb);
    return p;
}

void Settings::setNoiseGate (const NoiseGate::Parameters& p)
{
    props.setValue ("gateThresholdDb",  p.thresholdDb);
    props.setValue ("gateAttackMs",     p.attackMs);
    props.setValue ("gateHoldMs",       p.holdMs);
    props.setValue ("gateReleaseMs",    p.releaseMs);
    props.setValue ("gateHysteresisDb", p.hysteresisDb);
}

juce::String Settings::getInstrumentId() const
{
    return props.getValue ("instrument", "guitar6");
}

void Settings::setInstrumentId (const juce::String& id)
{
    props.setValue ("instrument", id);
}

juce::String Settings::profileKey (const juce::String& instrument, const char* name)
{
    return "inst." + instrument + "." + name;
}

bool Settings::hasProfile (const juce::String& instrument) const
{
    return props.containsKey (profileKey (instrument, "minHz"));
}

AnalysisWorker::DetectionConfig Settings::getDetectionConfig() const
{
    const AnalysisWorker::DetectionConfig d;
    AnalysisWorker::DetectionConfig c;
    const auto id = getInstrumentId();

    // Profil des aktuellen Instruments; ohne Profil die frueheren instrumentunabhaengigen Werte
    auto value = [&] (const char* name, const char* legacyKey, float fallback)
    {
        const auto key = profileKey (id, name);
        return props.containsKey (key) ? getFloat (props, key.toRawUTF8(), fallback)
                                       : getFloat (props, legacyKey, fallback);
    };

    c.minHz                   = value ("minHz",            "detectMinHz",          d.minHz);
    c.maxHz                   = value ("maxHz",            "detectMaxHz",          d.maxHz);
    c.tuning.minRiseDb        = value ("minRiseDb",        "tuneMinRiseDb",        d.tuning.minRiseDb);
    c.tuning.strongFluxFactor = value ("strongFluxFactor", "tuneStrongFluxFactor", d.tuning.strongFluxFactor);
    c.tuning.fluxMultiplier   = value ("fluxMultiplier",   "tuneFluxMultiplier",   d.tuning.fluxMultiplier);
    c.tuning.stableFrames     = static_cast<int> (value ("stableFrames", "tuneStableFrames", static_cast<float> (d.tuning.stableFrames)));
    c.tuning.legatoFrames     = static_cast<int> (value ("legatoFrames", "tuneLegatoFrames", static_cast<float> (d.tuning.legatoFrames)));

    // Die Cent-Toleranz haengt vom Spieler ab, nicht vom Instrument
    c.centsTolerance = getFloat (props, "detectCentsTolerance", d.centsTolerance);
    return c;
}

void Settings::setDetectionConfig (const AnalysisWorker::DetectionConfig& c)
{
    const auto id = getInstrumentId();
    props.setValue (profileKey (id, "minHz"),            c.minHz);
    props.setValue (profileKey (id, "maxHz"),            c.maxHz);
    props.setValue (profileKey (id, "minRiseDb"),        c.tuning.minRiseDb);
    props.setValue (profileKey (id, "strongFluxFactor"), c.tuning.strongFluxFactor);
    props.setValue (profileKey (id, "fluxMultiplier"),   c.tuning.fluxMultiplier);
    props.setValue (profileKey (id, "stableFrames"),     c.tuning.stableFrames);
    props.setValue (profileKey (id, "legatoFrames"),     c.tuning.legatoFrames);
    props.setValue ("detectCentsTolerance", c.centsTolerance);
}

juce::var Settings::getUiSettings()
{
    auto* result = new juce::DynamicObject();
    const auto& all = props.getAllProperties();

    for (int i = 0; i < all.size(); ++i)
    {
        const auto key = all.getAllKeys()[i];
        if (key.startsWith ("ui."))
            // fromString statt parse: parse liest nur Objekte/Arrays, Texte und Zahlen kaemen leer zurueck
            result->setProperty (key.substring (3), juce::JSON::fromString (all.getAllValues()[i]));
    }

    return juce::var (result);
}

void Settings::setUiSetting (const juce::String& key, const juce::var& value)
{
    if (value.isVoid() || value.isUndefined())
        props.removeValue ("ui." + key);
    else
        props.setValue ("ui." + key, juce::JSON::toString (value, true));
}

juce::File Settings::getDataDirectory() const
{
    return props.getFile().getParentDirectory();
}

void Settings::saveNow()
{
    props.saveIfNeeded();
}

} // namespace ft
