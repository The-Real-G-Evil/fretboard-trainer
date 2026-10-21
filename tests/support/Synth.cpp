#include "Synth.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <random>

namespace ft::test
{

namespace
{
    constexpr int maxHarmonics = 40;
    constexpr double twoPi = 2.0 * std::numbers::pi;
}

std::vector<float> renderNotes (const std::vector<SynthNote>& notes, double totalSec,
                                double sr, const Voice& voice, unsigned seed)
{
    const auto total = static_cast<size_t> (totalSec * sr);
    std::vector<float> out (total, 0.0f);

    std::mt19937 rng (seed);
    std::normal_distribution<double> gauss (0.0, 1.0);
    const auto noiseFloor = std::pow (10.0, voice.noiseFloorDb / 20.0);

    double phase[maxHarmonics] {};
    double envTime = -1.0;     // Zeit seit dem letzten Anschlag (< 0: Stille)
    double noteLevel = 0.0;
    double hz = 0.0;
    size_t next = 0;

    for (size_t i = 0; i < total; ++i)
    {
        const auto t = static_cast<double> (i) / sr;

        while (next < notes.size() && notes[next].startSec <= t)
        {
            const auto& n = notes[next++];
            hz = n.hz;

            if (! n.legato || envTime < 0.0)
            {
                envTime = 0.0;
                noteLevel = voice.level * std::pow (10.0, n.levelDb / 20.0);
                std::fill (std::begin (phase), std::end (phase), 0.0);
            }
        }

        double s = 0.0;

        if (envTime >= 0.0)
        {
            const auto attack = std::min (1.0, envTime / 0.002);

            for (int k = 1; k <= maxHarmonics; ++k)
            {
                const auto fk = k * hz * std::sqrt (1.0 + voice.inharmonicity * k * k);
                if (fk >= sr * 0.45)
                    break;

                auto amp = std::pow (1.0 / k, voice.brightness);
                if (k == 1)
                    amp *= voice.fundamentalLevel;

                amp *= std::exp (-envTime * (voice.decayPerSec + voice.decayPerHarmonic * k));

                phase[k - 1] += twoPi * fk / sr;
                if (phase[k - 1] > twoPi)
                    phase[k - 1] -= twoPi;

                s += amp * std::sin (phase[k - 1]);
            }

            s *= attack * noteLevel * 0.5;

            if (envTime < 0.003)
                s += voice.attackNoise * noteLevel * gauss (rng) * (1.0 - envTime / 0.003);

            envTime += 1.0 / sr;
        }

        out[i] = static_cast<float> (s + noiseFloor * gauss (rng));
    }

    return out;
}

std::vector<float> sine (double hz, double sec, double sr, double amplitude)
{
    std::vector<float> out (static_cast<size_t> (sec * sr));
    for (size_t i = 0; i < out.size(); ++i)
        out[i] = static_cast<float> (amplitude * std::sin (twoPi * hz * static_cast<double> (i) / sr));
    return out;
}

} // namespace ft::test
