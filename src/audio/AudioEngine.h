#pragma once

#include "audio/LevelMeter.h"
#include "audio/NoiseGate.h"
#include "audio/SpscFifo.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <atomic>
#include <vector>

namespace ft
{

/** Audio-Kern Phase 1: Eingang (ein Kanal) -> Gain -> Noisegate -> Mithoeren.

    Der Audio-Callback alloziert nicht, sperrt nicht und macht kein I/O.
    Parameter kommen ueber atomics herein, Pegelwerte gehen ueber eine
    lock-freie FIFO an den UI-Thread.
*/
class AudioEngine : private juce::AudioIODeviceCallback
{
public:
    struct DeviceConfig
    {
        juce::String type;
        juce::String inputDevice;
        juce::String outputDevice;
        double sampleRate   = 0.0;
        int    bufferSize   = 0;
        int    inputChannel = 0; ///< Index des physischen Eingangskanals
    };

    AudioEngine();
    ~AudioEngine() override;

    /** Startet das Audiogeraet; savedState stammt aus createDeviceStateXml(). */
    juce::String initialise (const juce::XmlElement* savedState);
    void shutdown();

    juce::AudioDeviceManager& getDeviceManager() noexcept { return deviceManager; }

    DeviceConfig getDeviceConfig() const;
    /** Liefert einen leeren String bei Erfolg, sonst die Fehlermeldung. */
    juce::String setDeviceConfig (const DeviceConfig& cfg);
    std::unique_ptr<juce::XmlElement> createDeviceStateXml() const;

    void setInputGainDb (float db) noexcept;
    void setMonitoring (bool on, float volumeDb) noexcept;
    void setNoiseGate (const NoiseGate::Parameters& p) noexcept;

    /** UI-Thread: alle seit dem letzten Aufruf gemessenen Bloecke einsammeln. */
    void drainLevels (LevelAccumulator& acc) noexcept;

private:
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                           float* const* outputChannelData, int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

    void applyPendingGateParameters() noexcept;

    juce::AudioDeviceManager deviceManager;

    // Parameter (UI -> Audio)
    std::atomic<float> inputGain { 1.0f };
    std::atomic<float> monitorGain { 1.0f };
    std::atomic<bool>  monitoringOn { true };

    std::atomic<float> gateThresholdDb, gateAttackMs, gateHoldMs, gateReleaseMs, gateHysteresisDb;
    std::atomic<unsigned> gateParamsVersion { 1 };
    unsigned appliedGateVersion = 0;

    // Audio-Thread-Zustand
    NoiseGate gate;
    std::vector<float> scratch;
    float currentMonitorGain = 0.0f;

    // Audio -> UI
    SpscFifo<LevelFrame, 512> levelFifo;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};

} // namespace ft
