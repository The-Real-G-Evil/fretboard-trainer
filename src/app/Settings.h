#pragma once

#include "audio/AnalysisWorker.h"
#include "audio/NoiseGate.h"

#include <juce_data_structures/juce_data_structures.h>

namespace ft
{

/** Persistente Einstellungen (Phase 1: JUCE PropertiesFile, XML). */
class Settings
{
public:
    Settings();

    std::unique_ptr<juce::XmlElement> getAudioDeviceState() const;
    void setAudioDeviceState (const juce::XmlElement* xml);

    float getInputGainDb() const;
    void  setInputGainDb (float db);

    bool  getMonitoringOn() const;
    float getMonitorVolumeDb() const;
    void  setMonitoring (bool on, float volumeDb);

    NoiseGate::Parameters getNoiseGate() const;
    void setNoiseGate (const NoiseGate::Parameters& p);

    AnalysisWorker::DetectionConfig getDetectionConfig() const;
    void setDetectionConfig (const AnalysisWorker::DetectionConfig& c);

    void saveNow();

private:
    juce::PropertiesFile props;
};

} // namespace ft
