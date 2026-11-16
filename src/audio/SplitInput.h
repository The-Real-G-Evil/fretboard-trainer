#pragma once

#include "audio/DriftResampler.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <atomic>
#include <memory>

namespace ft
{

/** Eigenes Eingangsgeraet neben dem Ausgangsgeraet des AudioDeviceManager (z. B. Rocksmith-Kabel
    als Eingang, Kopfhoerer als Ausgang). Beide Geraete haben eine eigene Uhr; der DriftResampler
    bringt den Eingang auf die Uhr des Ausgangs.

    start()/stop() nur vom Message-Thread. read() nur aus dem Callback des Ausgangsgeraets.
*/
class SplitInput : private juce::AudioIODeviceCallback
{
public:
    ~SplitInput() override { stop(); }

    /** Oeffnet das Eingangsgeraet (nur Eingang, ein Kanal). Bevorzugt die Abtastrate des Ausgangs,
        sonst 48 kHz. Liefert einen leeren String bei Erfolg, sonst die Fehlermeldung. */
    juce::String start (juce::AudioIODeviceType& type, const juce::String& deviceName, int channel,
                        double outputRate, int outputBlock);
    void stop();

    bool isActive() const noexcept { return active.load (std::memory_order_acquire); }
    juce::String getDeviceName() const { return deviceName; }
    int getChannel() const noexcept { return channel; }
    juce::StringArray getChannelNames() const;
    double getSampleRate() const noexcept { return device != nullptr ? device->getCurrentSampleRate() : 0.0; }

    /** Eingangslatenz laut Treiber plus Puffer des Resamplers (ms). */
    double getLatencyMs() const noexcept { return latencyMs.load (std::memory_order_relaxed); }

    /** Ausgangs-Callback: n Samples auf der Uhr des Ausgangs. Ohne Eingang: Stille, false. */
    bool read (float* out, int numSamples) noexcept;

    DriftResampler::Stats getStats() const noexcept { return resampler.getStats(); }
    /** Das Geraet hat sich gemeldet, dass es nicht mehr laeuft (abgezogen o. ae.). */
    bool hasFailed() const noexcept { return failed.load (std::memory_order_acquire); }

private:
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                           float* const* outputChannelData, int numOutputChannels,
                                           int numSamples, const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart (juce::AudioIODevice*) override { resampler.requestReset(); }
    void audioDeviceStopped() override {}
    void audioDeviceError (const juce::String&) override { failed.store (true, std::memory_order_release); }

    std::unique_ptr<juce::AudioIODevice> device;
    juce::String deviceName;
    int channel = 0;
    DriftResampler resampler;
    std::atomic<bool> active { false }, failed { false };
    std::atomic<int> readerBusy { 0 };
    std::atomic<double> latencyMs { 0.0 };
};

} // namespace ft
