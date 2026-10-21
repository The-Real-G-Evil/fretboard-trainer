#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include <set>

namespace ft
{

class AnalysisWorker;
class AudioEngine;
class Settings;

/** Native Funktionen fuer die Web-Oberflaeche (SPEC Abschnitt 9, Phase-1-Teilmenge).

    UI -> Kern:
      getAudioDevices()                    -> DeviceInfo
      setAudioDevice(cfg)                  -> DeviceInfo (+ error)
      setInputGain(db)
      setMonitoring(on, volumeDb)
      setNoiseGate({thresholdDb, attackMs, holdMs, releaseMs, hysteresisDb})
      setDetectionConfig({minHz, maxHz, centsTolerance})
      getSettings()                        -> { inputGainDb, monitoring, noiseGate, detection }

    Kern -> UI (Events, siehe MainComponent):
      level { rmsDb, peakDb, gateOpen }              ca. 30 Hz
      pitch { hz, midi, cents, confidence }          ca. 30 Hz (hz = 0, midi = -1: kein Ton)
      note  { midi, cents, timeMs, onsetType }       sobald erkannt; onsetType "pick" | "legato"
*/
class Bridge
{
public:
    Bridge (AudioEngine& engine, AnalysisWorker& analysis, Settings& settings);

    juce::WebBrowserComponent::Options registerFunctions (juce::WebBrowserComponent::Options options);

private:
    juce::var describeDevices (const juce::String& error = {});
    juce::var describeSettings() const;
    void persistDeviceState();

    AudioEngine& engine;
    AnalysisWorker& analysis;
    Settings& settings;
    std::set<juce::String> scannedTypes;
};

} // namespace ft
