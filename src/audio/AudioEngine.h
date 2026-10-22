#pragma once

#include "audio/LevelMeter.h"
#include "audio/Metronome.h"
#include "audio/NoiseGate.h"
#include "audio/SongPlayer.h"
#include "audio/SpscFifo.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <array>
#include <atomic>
#include <vector>

namespace ft
{

/** Audio-Kern: Eingang (ein Kanal) -> Gain -> Noisegate -> Mithoeren, plus Metronom auf
    eigenem Bus (unabhaengig vom Mithoeren).

    Gemeinsame Uhr: Jedes Sample hat eine fortlaufende Stream-Nummer (ab Geraetestart).
    Metronom-Schlaege und die Abschnitte fuer die Tonerkennung tragen diese Nummer, damit
    Anschlaege sample-genau gegen die Schlaege bewertet werden koennen.

    Der Audio-Callback alloziert nicht, sperrt nicht und macht kein I/O.
    Parameter kommen ueber atomics herein, Pegelwerte gehen ueber eine
    lock-freie FIFO an den UI-Thread.
*/
class AudioEngine : private juce::AudioIODeviceCallback
{
public:
    /** Eingangssignal (nach Gain, vor dem Gate) fuer den Analyse-Thread. */
    struct AnalysisChunk
    {
        static constexpr int capacity = 128;
        std::array<float, capacity> samples {};
        int  numSamples = 0;
        bool gateOpen = false;
        long long streamSample = 0; ///< Stream-Nummer des ersten Samples
    };

    struct MetronomeSettings
    {
        bool   on = false;
        double bpm = 80.0;
        float  volumeDb = -6.0f;
        int    beatsPerBar = 4; ///< 0 = keine Betonung
    };

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

    /** Einschalten startet den ersten Schlag ca. 150 ms spaeter; Aenderungen im Lauf behalten die Phase. */
    void setMetronome (const MetronomeSettings& m) noexcept;

    /** UI-Thread (einziger Leser): naechster Metronom-Schlag. */
    bool popBeat (BeatEvent& b) noexcept { return beatFifo.pop (b); }

    /** Eingangs- plus Ausgangslatenz des Geraets laut Treiber (fuer den Timing-Ausgleich). */
    double getRoundTripLatencyMs() const noexcept { return latencyMs.load (std::memory_order_relaxed); }

    /** Liedwiedergabe (Song-Modus) auf dem Ausgabebus, zusammen mit dem Metronom. */
    SongPlayer& getSongPlayer() noexcept { return songPlayer; }

    /** Beliebiger Thread: aktuelle Position der Stream-Uhr in ms (wie NoteEvent::timeSec * 1000),
        zwischen zwei Audio-Bloecken ueber die Systemuhr fortgeschrieben. */
    double getStreamTimeMs() const noexcept;

    /** Eingangslatenz des Geraets laut Treiber. */
    double getInputLatencyMs() const noexcept { return inputLatencyMs.load (std::memory_order_relaxed); }

    /** UI-Thread: alle seit dem letzten Aufruf gemessenen Bloecke einsammeln. */
    void drainLevels (LevelAccumulator& acc) noexcept;

    /** Analyse-Thread (einziger Leser). */
    bool popAnalysisChunk (AnalysisChunk& chunk) noexcept { return analysisFifo.pop (chunk); }

    /** Abtastrate des laufenden Streams und Zaehler, der bei jedem Gerätestart steigt. */
    double getSampleRate() const noexcept      { return sampleRate.load (std::memory_order_acquire); }
    unsigned getStreamGeneration() const noexcept { return streamGeneration.load (std::memory_order_acquire); }

private:
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData, int numInputChannels,
                                           float* const* outputChannelData, int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

    void applyPendingGateParameters() noexcept;
    void applyPendingMetronome() noexcept;

    juce::AudioDeviceManager deviceManager;

    // Parameter (UI -> Audio)
    std::atomic<float> inputGain { 1.0f };
    std::atomic<float> monitorGain { 1.0f };
    std::atomic<bool>  monitoringOn { true };

    std::atomic<float> gateThresholdDb, gateAttackMs, gateHoldMs, gateReleaseMs, gateHysteresisDb;
    std::atomic<unsigned> gateParamsVersion { 1 };
    unsigned appliedGateVersion = 0;

    std::atomic<bool>   metroOn { false };
    std::atomic<double> metroBpm { 80.0 };
    std::atomic<float>  metroGain { 0.5f };
    std::atomic<int>    metroBeatsPerBar { 4 };
    std::atomic<unsigned> metroVersion { 1 };
    unsigned appliedMetroVersion = 0;

    // Audio-Thread-Zustand
    NoiseGate gate;
    Metronome metronome;
    SongPlayer songPlayer;
    std::vector<float> scratch, metroBuffer;
    float currentMonitorGain = 0.0f;
    long long streamSample = 0;

    // Audio -> UI / Analyse
    SpscFifo<LevelFrame, 512> levelFifo;
    SpscFifo<AnalysisChunk, 2048> analysisFifo; // ~5 s bei 48 kHz
    SpscFifo<BeatEvent, 128> beatFifo;
    std::atomic<double> latencyMs { 0.0 }, inputLatencyMs { 0.0 };
    std::atomic<long long> clockSample { 0 };      ///< Stream-Sample am Ende des letzten Blocks
    std::atomic<double>    clockSystemMs { 0.0 };  ///< Systemzeit dazu (Millisekunden, hochaufloesend)
    std::atomic<double> sampleRate { 48000.0 };
    std::atomic<unsigned> streamGeneration { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};

} // namespace ft
