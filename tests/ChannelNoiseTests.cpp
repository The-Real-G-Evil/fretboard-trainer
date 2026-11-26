#include "audio/ChannelNoise.h"

#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <numbers>
#include <random>
#include <vector>

using ft::ChannelLevels;

namespace
{
    constexpr double sr = 48000.0;

    ChannelLevels measure (const std::vector<float>& x)
    {
        ChannelLevels l;
        // in Bloecken wie im Audio-Callback
        for (size_t i = 0; i < x.size(); i += 480)
            l.add (x.data() + i, static_cast<int> (std::min<size_t> (480, x.size() - i)));
        return l;
    }

    std::vector<float> tone (double hz, double amp, double sec = 0.6)
    {
        std::vector<float> x (static_cast<size_t> (sec * sr));
        for (size_t i = 0; i < x.size(); ++i)
            x[i] = static_cast<float> (amp * std::sin (2.0 * std::numbers::pi * hz * static_cast<double> (i) / sr));
        return x;
    }

    std::vector<float> noise (double amp, double sec = 0.6)
    {
        std::mt19937 rng (42);
        std::uniform_real_distribution<float> d (-1.0f, 1.0f);
        std::vector<float> x (static_cast<size_t> (sec * sr));
        for (auto& v : x)
            v = static_cast<float> (amp) * d (rng);
        return x;
    }
}

TEST_CASE ("Kanalpruefung: lautes Rauschen ist gestoert")
{
    CHECK (measure (noise (0.8)).looksLikeNoise());  // wie Kanal 1 des Rocksmith-Kabels (~-6 dBFS)
    CHECK (measure (noise (0.05)).looksLikeNoise());
}

TEST_CASE ("Kanalpruefung: Instrument und Stille sind sauber")
{
    CHECK_FALSE (measure (tone (41.2, 0.9)).looksLikeNoise());  // tiefes E, laut gespielt
    CHECK_FALSE (measure (tone (440.0, 0.5)).looksLikeNoise());
    CHECK_FALSE (measure (tone (1320.0, 0.3)).looksLikeNoise()); // hoher Oberton
    CHECK_FALSE (measure (noise (0.002)).looksLikeNoise());      // Grundrauschen eines offenen Eingangs
    CHECK_FALSE (measure (std::vector<float> (28800, 0.0f)).looksLikeNoise());
    CHECK_FALSE (ChannelLevels {}.looksLikeNoise());
}
