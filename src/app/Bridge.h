#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include <set>

namespace ft
{

class AudioEngine;
class Settings;

/** Native Funktionen fuer die Web-Oberflaeche (SPEC Abschnitt 9, Phase-1-Teilmenge).

    UI -> Kern:
      getAudioDevices()                    -> DeviceInfo
      setAudioDevice(cfg)                  -> DeviceInfo (+ error)
      setInputGain(db)
      setMonitoring(on, volumeDb)
      setNoiseGate({thresholdDb, attackMs, holdMs, releaseMs, hysteresisDb})
      getSettings()                        -> { inputGainDb, monitoring, noiseGate }

    Kern -> UI (Events, siehe MainComponent):
      level { rmsDb, peakDb, gateOpen }   ca. 30 Hz
*/
class Bridge
{
public:
    Bridge (AudioEngine& engine, Settings& settings);

    juce::WebBrowserComponent::Options registerFunctions (juce::WebBrowserComponent::Options options);

private:
    juce::var describeDevices (const juce::String& error = {});
    juce::var describeSettings() const;
    void persistDeviceState();

    AudioEngine& engine;
    Settings& settings;
    std::set<juce::String> scannedTypes;
};

} // namespace ft
