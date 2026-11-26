#pragma once

#include "audio/ChannelNoise.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <array>
#include <functional>
#include <memory>
#include <vector>

namespace ft
{

/** Prueft kurz alle Eingangskanaele eines Geraets (zweite, eigene Verbindung zum Geraet): Liefert ein Kanal
    lautes, breitbandiges Rauschen, gilt er als gestoert. Beispiel: Das Rocksmith-Kabel meldet zwei Kanaele,
    auf Kanal 1 kommt nur Datenmuell. Nur fuer Treiber, die ein Geraet mehrfach oeffnen koennen (nicht ASIO).
    Alles im Message-Thread; die Messung laeuft im Callback des Geraets. */
class ChannelCheck : private juce::AudioIODeviceCallback,
                     private juce::Timer
{
public:
    /** faulty[i]: Kanal i ist gestoert. Wird nur bei erfolgreicher Messung aufgerufen. */
    using Done = std::function<void (const juce::String& device, const std::vector<bool>& faulty)>;

    ~ChannelCheck() override { cancel(); }

    void start (juce::AudioIODeviceType& type, const juce::String& deviceName, Done done);
    void cancel();

private:
    void timerCallback() override;
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                           float* const* outputChannelData, int numOutputChannels, int numSamples,
                                           const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart (juce::AudioIODevice*) override {}
    void audioDeviceStopped() override {}

    static constexpr int maxChannels = 32;
    static constexpr int measureMs = 700;

    std::unique_ptr<juce::AudioIODevice> device;
    juce::String name;
    Done onDone;
    std::array<ChannelLevels, maxChannels> levels {};
    int numChannels = 0;
};

} // namespace ft
