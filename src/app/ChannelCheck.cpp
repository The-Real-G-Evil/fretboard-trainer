#include "app/ChannelCheck.h"

namespace ft
{

void ChannelCheck::start (juce::AudioIODeviceType& type, const juce::String& deviceName, Done done)
{
    cancel();

    std::unique_ptr<juce::AudioIODevice> d (type.createDevice ({}, deviceName));
    if (d == nullptr)
        return;

    numChannels = juce::jmin (maxChannels, d->getInputChannelNames().size());
    if (numChannels < 2)
        return; // nur ein Kanal: nichts zu waehlen

    juce::BigInteger inputs;
    inputs.setRange (0, numChannels, true);
    if (d->open (inputs, {}, 0.0, 0).isNotEmpty()) // Standardrate und -puffer des Geraets
        return;

    levels = {};
    name = deviceName;
    onDone = std::move (done);
    device = std::move (d);
    device->start (this);
    startTimer (measureMs);
}

void ChannelCheck::cancel()
{
    stopTimer();
    if (device != nullptr)
    {
        device->stop(); // wartet, bis der Callback fertig ist
        device->close();
        device = nullptr;
    }
    onDone = nullptr;
}

void ChannelCheck::timerCallback()
{
    stopTimer();
    if (device == nullptr)
        return;
    device->stop();
    device->close();
    device = nullptr;

    std::vector<bool> faulty (static_cast<size_t> (numChannels));
    for (int i = 0; i < numChannels; ++i)
        faulty[static_cast<size_t> (i)] = levels[static_cast<size_t> (i)].looksLikeNoise();

    // Aufrufer darf dabei eine neue Pruefung starten (start() setzt onDone neu)
    auto done = std::move (onDone);
    onDone = nullptr;
    if (done)
        done (name, faulty);
}

void ChannelCheck::audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                                     float* const*, int, int numSamples,
                                                     const juce::AudioIODeviceCallbackContext&)
{
    // JUCE reicht nur aktive Kanaele durch, in ihrer Reihenfolge; alle sind aktiv
    for (int ch = 0; ch < juce::jmin (numInputChannels, numChannels); ++ch)
        if (inputChannelData[ch] != nullptr)
            levels[static_cast<size_t> (ch)].add (inputChannelData[ch], numSamples);
}

} // namespace ft
