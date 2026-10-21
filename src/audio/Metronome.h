#pragma once

#include <vector>

namespace ft
{

struct BeatEvent
{
    long long index  = 0; ///< 0 = erster Schlag nach dem Start
    long long sample = 0; ///< Stream-Sample, an dem der Klick beginnt
    bool      accent = false;
};

/** Metronom im Audio-Thread: plant Schlaege sample-genau auf der Stream-Uhr und mischt
    einen kurzen Klick (betont auf Zaehlzeit 1) in einen Puffer.

    prepare() alloziert; alles andere ist echtzeitsicher.
*/
class Metronome
{
public:
    void prepare (double sampleRate);

    /** Startet so, dass Schlag 0 auf firstBeatSample faellt. */
    void start (long long firstBeatSample, double bpm, int beatsPerBar) noexcept;
    void stop() noexcept { running = false; }
    bool isRunning() const noexcept { return running; }

    /** Tempo/Taktart aendern, ohne die Phase zu verlieren (gilt ab dem naechsten Schlag). */
    void setTempo (double bpm, int beatsPerBar) noexcept;
    void setGain (float g) noexcept { gain = g; }

    double getBpm() const noexcept { return bpm; }

    /** Addiert Klicks fuer [blockStart, blockStart + numSamples) in out und ruft onBeat
        fuer jeden Schlag auf, der in diesem Block beginnt. */
    template <typename OnBeat>
    void process (float* out, int numSamples, long long blockStart, OnBeat&& onBeat) noexcept
    {
        for (int i = 0; i < numSamples; ++i)
        {
            const auto s = blockStart + i;

            if (running && static_cast<double> (s) >= nextBeat)
            {
                const bool accent = beatsPerBar > 0 && beatIndex % beatsPerBar == 0;
                onBeat (BeatEvent { beatIndex, s, accent });
                clickPos = 0;
                clickAccent = accent;
                ++beatIndex;
                nextBeat += samplesPerBeat();
            }

            const auto& click = clickAccent ? accentClick : normalClick;
            if (clickPos < static_cast<int> (click.size()))
                out[i] += gain * click[static_cast<size_t> (clickPos++)];
        }
    }

private:
    double samplesPerBeat() const noexcept { return sampleRate * 60.0 / bpm; }

    double sampleRate = 48000.0;
    double bpm = 80.0;
    int beatsPerBar = 4;
    float gain = 0.5f;

    bool running = false;
    double nextBeat = 0.0;
    long long beatIndex = 0;

    std::vector<float> normalClick, accentClick;
    int clickPos = 1 << 30;
    bool clickAccent = false;
};

} // namespace ft
