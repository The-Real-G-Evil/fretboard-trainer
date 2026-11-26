#include "audio/SplitInput.h"

namespace ft
{

namespace
{
    double chooseRate (const juce::Array<double>& rates, double outputRate)
    {
        for (const auto preferred : { outputRate, 48000.0, 44100.0 })
            if (rates.contains (preferred))
                return preferred;
        return rates.isEmpty() ? 0.0 : rates.getFirst();
    }

    /** Kleiner Eingangspuffer = wenig Zusatzlatenz: hoechstens so gross wie der Ausgangspuffer, max. 256. */
    int chooseBlock (const juce::Array<int>& sizes, int outputBlock, int fallback)
    {
        const auto wanted = juce::jmin (outputBlock > 0 ? outputBlock : 256, 256);
        auto best = 0;
        for (const auto s : sizes)
            if (s <= wanted && s >= 32 && s > best)
                best = s;
        return best > 0 ? best : fallback;
    }
}

juce::String SplitInput::start (juce::AudioIODeviceType& type, const juce::String& name, int ch,
                                double outputRate, int outputBlock)
{
    stop();

    std::unique_ptr<juce::AudioIODevice> d (type.createDevice ({}, name));
    if (d == nullptr)
        return juce::String::fromUTF8 ("Eingangsger\xc3\xa4t nicht verf\xc3\xbcgbar: ") + name;

    const auto numChannels = d->getInputChannelNames().size();
    if (numChannels == 0)
        return juce::String::fromUTF8 ("Eingangsger\xc3\xa4t hat keine Eing\xc3\xa4nge: ") + name;

    ch = juce::jlimit (0, numChannels - 1, ch);
    juce::BigInteger inputs;
    inputs.setBit (ch);

    const auto rate = chooseRate (d->getAvailableSampleRates(), outputRate);
    const auto block = chooseBlock (d->getAvailableBufferSizes(), outputBlock, d->getDefaultBufferSize());
    const auto error = d->open (inputs, {}, rate, block);
    if (error.isNotEmpty())
        return error;

    const auto inRate = d->getCurrentSampleRate();
    const auto inBlock = d->getCurrentBufferSizeSamples();
    resampler.prepare (inRate, outputRate, inBlock, outputBlock);
    latencyMs.store (1000.0 * d->getInputLatencyInSamples() / juce::jmax (1.0, inRate) + resampler.getLatencyMs(),
                     std::memory_order_relaxed);

    device = std::move (d);
    deviceName = name;
    channel = ch;
    failed.store (false, std::memory_order_release);

    device->start (this);
    active.store (true, std::memory_order_release);
    return {};
}

void SplitInput::stop()
{
    active.store (false); // seq_cst: Gegenstueck zu read() (Dekker)
    while (readerBusy.load() > 0)
        juce::Thread::sleep (1);

    if (device != nullptr)
    {
        device->stop(); // wartet, bis der Eingangs-Callback fertig ist
        device->close();
        device = nullptr;
    }
    deviceName.clear();
}

juce::StringArray SplitInput::getChannelNames() const
{
    return device != nullptr ? device->getInputChannelNames() : juce::StringArray();
}

bool SplitInput::read (float* out, int numSamples) noexcept
{
    readerBusy.fetch_add (1);
    const auto ok = active.load();
    if (ok)
        resampler.read (out, numSamples);
    else
        std::fill (out, out + numSamples, 0.0f);
    readerBusy.fetch_sub (1, std::memory_order_release);
    return ok;
}

void SplitInput::audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                                   float* const*, int, int numSamples,
                                                   const juce::AudioIODeviceCallbackContext&)
{
    // Genau ein Kanal ist aktiv; JUCE reicht nur aktive Kanaele durch
    if (numInputChannels > 0 && inputChannelData[0] != nullptr)
        resampler.write (inputChannelData[0], numSamples);
}

} // namespace ft
