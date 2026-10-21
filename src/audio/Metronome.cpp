#include "audio/Metronome.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace ft
{

namespace
{
    constexpr double clickMs = 30.0;

    std::vector<float> makeClick (double sampleRate, double hz, double level)
    {
        std::vector<float> c (static_cast<size_t> (clickMs * 0.001 * sampleRate));
        for (size_t i = 0; i < c.size(); ++i)
        {
            const auto t = static_cast<double> (i) / sampleRate;
            const auto env = std::exp (-t / 0.006) * std::min (1.0, t / 0.0005); // 0,5 ms Einschwingen
            c[i] = static_cast<float> (level * env * std::sin (2.0 * std::numbers::pi * hz * t));
        }
        return c;
    }
}

void Metronome::prepare (double sr)
{
    sampleRate = sr > 0.0 ? sr : 48000.0;
    normalClick = makeClick (sampleRate, 1000.0, 0.6);
    accentClick = makeClick (sampleRate, 1600.0, 1.0);
    clickPos = 1 << 30;
    running = false;
}

void Metronome::start (long long firstBeatSample, double newBpm, int newBeatsPerBar) noexcept
{
    bpm = std::clamp (newBpm, 20.0, 400.0);
    beatsPerBar = std::max (0, newBeatsPerBar);
    nextBeat = static_cast<double> (firstBeatSample);
    beatIndex = 0;
    running = true;
}

void Metronome::setTempo (double newBpm, int newBeatsPerBar) noexcept
{
    if (! running)
    {
        bpm = std::clamp (newBpm, 20.0, 400.0);
        beatsPerBar = std::max (0, newBeatsPerBar);
        return;
    }

    // Der naechste Schlag liegt schon fest; danach gilt das neue Tempo
    bpm = std::clamp (newBpm, 20.0, 400.0);
    beatsPerBar = std::max (0, newBeatsPerBar);
}

} // namespace ft
