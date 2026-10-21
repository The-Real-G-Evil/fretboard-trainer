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

    float getFloat (const juce::PropertiesFile& p, const char* key, float fallback)
    {
        return static_cast<float> (p.getDoubleValue (key, fallback));
    }
}

Settings::Settings() : props (makeOptions())
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

AnalysisWorker::DetectionConfig Settings::getDetectionConfig() const
{
    const AnalysisWorker::DetectionConfig d;
    AnalysisWorker::DetectionConfig c;
    c.minHz          = getFloat (props, "detectMinHz",          d.minHz);
    c.maxHz          = getFloat (props, "detectMaxHz",          d.maxHz);
    c.centsTolerance = getFloat (props, "detectCentsTolerance", d.centsTolerance);
    return c;
}

void Settings::setDetectionConfig (const AnalysisWorker::DetectionConfig& c)
{
    props.setValue ("detectMinHz",          c.minHz);
    props.setValue ("detectMaxHz",          c.maxHz);
    props.setValue ("detectCentsTolerance", c.centsTolerance);
}

void Settings::saveNow()
{
    props.saveIfNeeded();
}

} // namespace ft
