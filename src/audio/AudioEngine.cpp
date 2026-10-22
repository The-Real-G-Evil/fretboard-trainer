#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    constexpr int numInputsNeeded  = 1;
    constexpr int numOutputsNeeded = 2;
    constexpr int minScratchSize   = 4096;

    int firstSetBit (const juce::BigInteger& bits)
    {
        const auto i = bits.findNextSetBit (0);
        return i < 0 ? 0 : i;
    }
}

AudioEngine::AudioEngine()
{
    const NoiseGate::Parameters defaults;
    gateThresholdDb  = defaults.thresholdDb;
    gateAttackMs     = defaults.attackMs;
    gateHoldMs       = defaults.holdMs;
    gateReleaseMs    = defaults.releaseMs;
    gateHysteresisDb = defaults.hysteresisDb;
}

AudioEngine::~AudioEngine()
{
    shutdown();
}

juce::String AudioEngine::initialise (const juce::XmlElement* savedState)
{
    auto error = deviceManager.initialise (numInputsNeeded, numOutputsNeeded, savedState, true);
    deviceManager.addAudioCallback (this);
    return error;
}

void AudioEngine::shutdown()
{
    deviceManager.removeAudioCallback (this);
    deviceManager.closeAudioDevice();
}

AudioEngine::DeviceConfig AudioEngine::getDeviceConfig() const
{
    DeviceConfig cfg;
    const auto setup = deviceManager.getAudioDeviceSetup();

    cfg.type         = deviceManager.getCurrentAudioDeviceType();
    cfg.inputDevice  = setup.inputDeviceName;
    cfg.outputDevice = setup.outputDeviceName;
    cfg.sampleRate   = setup.sampleRate;
    cfg.bufferSize   = setup.bufferSize;

    if (auto* device = deviceManager.getCurrentAudioDevice())
    {
        cfg.sampleRate   = device->getCurrentSampleRate();
        cfg.bufferSize   = device->getCurrentBufferSizeSamples();
        cfg.inputChannel = firstSetBit (device->getActiveInputChannels());
    }
    else
    {
        cfg.inputChannel = firstSetBit (setup.inputChannels);
    }

    return cfg;
}

juce::String AudioEngine::setDeviceConfig (const DeviceConfig& cfg)
{
    if (cfg.type.isNotEmpty() && cfg.type != deviceManager.getCurrentAudioDeviceType())
        deviceManager.setCurrentAudioDeviceType (cfg.type, true);

    auto setup = deviceManager.getAudioDeviceSetup();

    // Bei einem Typwechsel gelten die uebergebenen Geraetenamen evtl. nicht mehr;
    // leere Namen lassen JUCE das Standardgeraet des Typs behalten.
    if (cfg.inputDevice.isNotEmpty())  setup.inputDeviceName  = cfg.inputDevice;
    if (cfg.outputDevice.isNotEmpty()) setup.outputDeviceName = cfg.outputDevice;
    if (cfg.sampleRate > 0.0)          setup.sampleRate       = cfg.sampleRate;
    if (cfg.bufferSize > 0)            setup.bufferSize       = cfg.bufferSize;

    setup.useDefaultInputChannels = false;
    setup.inputChannels.clear();
    setup.inputChannels.setBit (juce::jmax (0, cfg.inputChannel));

    setup.useDefaultOutputChannels = false;
    setup.outputChannels.clear();
    setup.outputChannels.setRange (0, numOutputsNeeded, true);

    return deviceManager.setAudioDeviceSetup (setup, true);
}

std::unique_ptr<juce::XmlElement> AudioEngine::createDeviceStateXml() const
{
    return deviceManager.createStateXml();
}

void AudioEngine::setInputGainDb (float db) noexcept
{
    inputGain.store (dbToGain (db), std::memory_order_relaxed);
}

void AudioEngine::setMonitoring (bool on, float volumeDb) noexcept
{
    monitorGain.store (dbToGain (volumeDb), std::memory_order_relaxed);
    monitoringOn.store (on, std::memory_order_relaxed);
}

void AudioEngine::setNoiseGate (const NoiseGate::Parameters& p) noexcept
{
    gateThresholdDb.store (p.thresholdDb, std::memory_order_relaxed);
    gateAttackMs.store (p.attackMs, std::memory_order_relaxed);
    gateHoldMs.store (p.holdMs, std::memory_order_relaxed);
    gateReleaseMs.store (p.releaseMs, std::memory_order_relaxed);
    gateHysteresisDb.store (p.hysteresisDb, std::memory_order_relaxed);
    gateParamsVersion.fetch_add (1, std::memory_order_release);
}

void AudioEngine::setMetronome (const MetronomeSettings& m) noexcept
{
    metroBpm.store (m.bpm, std::memory_order_relaxed);
    metroGain.store (m.on ? dbToGain (m.volumeDb) : 0.0f, std::memory_order_relaxed);
    metroBeatsPerBar.store (m.beatsPerBar, std::memory_order_relaxed);
    metroOn.store (m.on, std::memory_order_relaxed);
    metroVersion.fetch_add (1, std::memory_order_release);
}

void AudioEngine::applyPendingMetronome() noexcept
{
    const auto version = metroVersion.load (std::memory_order_acquire);
    if (version == appliedMetroVersion)
        return;

    appliedMetroVersion = version;
    const auto bpm = metroBpm.load (std::memory_order_relaxed);
    const auto beatsPerBar = metroBeatsPerBar.load (std::memory_order_relaxed);
    metronome.setGain (metroGain.load (std::memory_order_relaxed));

    if (! metroOn.load (std::memory_order_relaxed))
        metronome.stop();
    else if (! metronome.isRunning())
        metronome.start (streamSample + static_cast<long long> (0.15 * sampleRate.load (std::memory_order_relaxed)), bpm, beatsPerBar);
    else
        metronome.setTempo (bpm, beatsPerBar);
}

void AudioEngine::drainLevels (LevelAccumulator& acc) noexcept
{
    LevelFrame f;
    while (levelFifo.pop (f))
        acc.add (f);
}

void AudioEngine::applyPendingGateParameters() noexcept
{
    const auto version = gateParamsVersion.load (std::memory_order_acquire);

    if (version == appliedGateVersion)
        return;

    NoiseGate::Parameters p;
    p.thresholdDb  = gateThresholdDb.load (std::memory_order_relaxed);
    p.attackMs     = gateAttackMs.load (std::memory_order_relaxed);
    p.holdMs       = gateHoldMs.load (std::memory_order_relaxed);
    p.releaseMs    = gateReleaseMs.load (std::memory_order_relaxed);
    p.hysteresisDb = gateHysteresisDb.load (std::memory_order_relaxed);
    gate.setParameters (p);
    appliedGateVersion = version;
}

void AudioEngine::audioDeviceAboutToStart (juce::AudioIODevice* device)
{
    scratch.assign (static_cast<size_t> (juce::jmax (minScratchSize, device->getCurrentBufferSizeSamples())), 0.0f);
    appliedGateVersion = 0;
    applyPendingGateParameters();
    gate.prepare (device->getCurrentSampleRate());
    currentMonitorGain = 0.0f;

    // Neue Stream-Uhr; ein laufendes Metronom startet auf ihr neu
    streamSample = 0;
    metroBuffer.assign (scratch.size(), 0.0f);
    metronome.prepare (device->getCurrentSampleRate());
    appliedMetroVersion = 0;
    songPlayer.prepare (device->getCurrentSampleRate(), static_cast<int> (scratch.size()));

    const auto sr = juce::jmax (1.0, device->getCurrentSampleRate());
    latencyMs.store (1000.0 * (device->getInputLatencyInSamples() + device->getOutputLatencyInSamples()) / sr,
                     std::memory_order_relaxed);
    inputLatencyMs.store (1000.0 * device->getInputLatencyInSamples() / sr, std::memory_order_relaxed);
    clockSample.store (0, std::memory_order_relaxed);
    clockSystemMs.store (juce::Time::getMillisecondCounterHiRes(), std::memory_order_relaxed);

    sampleRate.store (device->getCurrentSampleRate(), std::memory_order_release);
    streamGeneration.fetch_add (1, std::memory_order_release);
}

void AudioEngine::audioDeviceStopped()
{
    gate.reset();
}

void AudioEngine::audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                                    float* const* outputChannelData, int numOutputChannels,
                                                    int numSamples,
                                                    const juce::AudioIODeviceCallbackContext&)
{
    applyPendingGateParameters();
    applyPendingMetronome();

    const auto gainIn = inputGain.load (std::memory_order_relaxed);
    const auto targetMonitorGain = monitoringOn.load (std::memory_order_relaxed)
                                     ? monitorGain.load (std::memory_order_relaxed)
                                     : 0.0f;

    // Der Geraetemanager reicht nur aktive Kanaele durch; wir aktivieren genau einen.
    const float* input = numInputChannels > 0 ? inputChannelData[0] : nullptr;
    const auto capacity = static_cast<int> (scratch.size());

    for (int offset = 0; offset < numSamples; offset += capacity)
    {
        const auto n = juce::jmin (capacity, numSamples - offset);
        auto* buf = scratch.data();

        if (input != nullptr)
            for (int i = 0; i < n; ++i)
                buf[i] = input[offset + i] * gainIn;
        else
            std::fill (buf, buf + n, 0.0f);

        // Pegel vor dem Gate messen: so ist die Schwelle in der Anzeige vergleichbar
        auto frame = measureBlock (buf, n);

        // Analyse bekommt das ungegatete Signal (das Gate wuerde Anschlaege verfaelschen)
        // und den Gate-Zustand je Teilblock; Tonhoehe wird nur bei offenem Gate bestimmt.
        for (int start = 0; start < n; start += AnalysisChunk::capacity)
        {
            const auto len = juce::jmin (AnalysisChunk::capacity, n - start);
            AnalysisChunk chunk;
            std::copy (buf + start, buf + start + len, chunk.samples.begin());
            chunk.numSamples = len;
            chunk.streamSample = streamSample + offset + start;

            gate.process (buf + start, len);
            chunk.gateOpen = gate.isOpen();
            analysisFifo.push (chunk); // voll = Analyse kommt nicht hinterher -> verwerfen
        }

        frame.gateOpen = gate.isOpen();
        levelFifo.push (frame); // bei voller FIFO (UI haengt) wird der Block verworfen

        // Metronom auf eigenem Bus (klingt auch ohne Mithoeren)
        auto* metro = metroBuffer.data();
        std::fill (metro, metro + n, 0.0f);
        metronome.process (metro, n, streamSample + offset, [this] (const BeatEvent& b) { beatFifo.push (b); });
        songPlayer.process (metro, n, streamSample + offset); // Lied auf demselben Bus

        // Ausgangslautstaerke linear ueber den Block rampen (kein Knacken beim Umschalten)
        const auto step = (targetMonitorGain - currentMonitorGain) / static_cast<float> (n);

        for (int ch = 0; ch < numOutputChannels; ++ch)
        {
            if (auto* out = outputChannelData[ch])
            {
                auto g = currentMonitorGain;
                for (int i = 0; i < n; ++i)
                {
                    g += step;
                    out[offset + i] = buf[i] * g + metro[i];
                }
            }
        }

        currentMonitorGain = targetMonitorGain;
    }

    streamSample += numSamples;

    // Bezug Stream-Uhr <-> Systemuhr fuer getStreamTimeMs() (zwei lock-freie Atomics, beim Lesen geprueft)
    clockSystemMs.store (juce::Time::getMillisecondCounterHiRes(), std::memory_order_relaxed);
    clockSample.store (streamSample, std::memory_order_release);
}

double AudioEngine::getStreamTimeMs() const noexcept
{
    long long sample = 0;
    double systemMs = 0.0;
    for (int attempt = 0; attempt < 4; ++attempt)
    {
        sample = clockSample.load (std::memory_order_acquire);
        systemMs = clockSystemMs.load (std::memory_order_relaxed);
        if (clockSample.load (std::memory_order_acquire) == sample)
            break; // kein Block dazwischen
    }
    const auto sr = sampleRate.load (std::memory_order_acquire);
    const auto sinceBlock = juce::jlimit (0.0, 100.0, juce::Time::getMillisecondCounterHiRes() - systemMs);
    return 1000.0 * static_cast<double> (sample) / sr + sinceBlock;
}

} // namespace ft
