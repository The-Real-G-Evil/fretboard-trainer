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

    /** Aktuelles Instrument (Vorlagen-Id der Oberflaeche, z. B. "bass4"). */
    juce::String getInstrumentId() const;
    void setInstrumentId (const juce::String& id);

    /** true, wenn fuer das Instrument schon Tonbereich/Erkennungsparameter gespeichert sind. */
    bool hasProfile (const juce::String& instrument) const;

    /** Erkennung des aktuellen Instruments: Tonbereich und Parameter aus dessen Profil,
        Cent-Toleranz instrumentuebergreifend. */
    AnalysisWorker::DetectionConfig getDetectionConfig() const;
    void setDetectionConfig (const AnalysisWorker::DetectionConfig& c);

    /** Einstellungen der Oberflaeche (z. B. Stimmung, Schluessel, Uebungsbereich) als JSON-Werte
        unter frei waehlbaren Schluesseln. */
    juce::var getUiSettings();
    void setUiSetting (const juce::String& key, const juce::var& value);

    /** Ordner der Einstellungsdatei; auch fuer weitere Nutzerdaten (Kalibrierung). */
    juce::File getDataDirectory() const;

    void saveNow();

private:
    static juce::String profileKey (const juce::String& instrument, const char* name);

    juce::PropertiesFile props;
};

} // namespace ft
