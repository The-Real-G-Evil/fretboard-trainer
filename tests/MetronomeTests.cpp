#include "audio/Metronome.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>

#include <cmath>
#include <vector>

using namespace ft;

namespace
{
    std::vector<BeatEvent> run (Metronome& m, long long fromSample, long long toSample, int blockSize, std::vector<float>* audio = nullptr)
    {
        std::vector<BeatEvent> beats;
        std::vector<float> block (static_cast<size_t> (blockSize));

        for (long long s = fromSample; s < toSample; s += blockSize)
        {
            const auto n = static_cast<int> (std::min<long long> (blockSize, toSample - s));
            std::fill (block.begin(), block.end(), 0.0f);
            m.process (block.data(), n, s, [&] (const BeatEvent& b) { beats.push_back (b); });
            if (audio)
                audio->insert (audio->end(), block.begin(), block.begin() + n);
        }
        return beats;
    }
}

TEST_CASE ("Metronom: Schlaege liegen sample-genau, unabhaengig von der Blockgroesse")
{
    const auto blockSize = GENERATE (1, 64, 441, 480, 1024);
    Metronome m;
    m.prepare (48000.0);
    m.start (1000, 120.0, 4); // 120 BPM = alle 24000 Samples

    const auto beats = run (m, 0, 1000 + 24000 * 8 + 1, blockSize);
    REQUIRE (beats.size() == 9);
    for (size_t i = 0; i < beats.size(); ++i)
    {
        CHECK (beats[i].index == static_cast<long long> (i));
        CHECK (beats[i].sample == 1000 + 24000 * static_cast<long long> (i));
        CHECK (beats[i].accent == (i % 4 == 0));
    }
}

TEST_CASE ("Metronom: krumme Schlaglaengen summieren keinen Fehler auf")
{
    Metronome m;
    m.prepare (44100.0);
    m.start (0, 97.0, 4); // 27278,35… Samples pro Schlag

    const auto beats = run (m, 0, 44100 * 120, 512); // 2 Minuten
    const auto spb = 44100.0 * 60.0 / 97.0;
    REQUIRE (beats.size() > 190);
    for (const auto& b : beats)
        CHECK (std::abs (static_cast<double> (b.sample) - std::ceil (spb * static_cast<double> (b.index))) <= 1.0);
}

TEST_CASE ("Metronom: Klick beginnt auf dem Schlag, Betonung ist lauter, Stopp ist still")
{
    Metronome m;
    m.prepare (48000.0);
    m.setGain (1.0f);
    m.start (100, 60.0, 4);

    std::vector<float> audio;
    run (m, 0, 48000 * 2 + 100 + 2000, 256, &audio);

    auto peak = [&] (size_t from, size_t to)
    {
        float p = 0.0f;
        for (auto i = from; i < to; ++i)
            p = std::max (p, std::abs (audio[i]));
        return p;
    };

    CHECK (peak (0, 100) == 0.0f);               // vor dem ersten Schlag Stille
    CHECK (peak (100, 1600) > 0.5f);             // betonter Klick
    CHECK (peak (48100, 49600) > 0.2f);          // normaler Klick
    CHECK (peak (100, 1600) > peak (48100, 49600));
    CHECK (peak (3000, 48000) < 1e-3f);          // dazwischen still

    m.stop();
    std::vector<float> after;
    const auto beats = run (m, 200000, 300000, 256, &after);
    CHECK (beats.empty());
}

TEST_CASE ("Metronom: Tempowechsel behaelt den naechsten Schlag")
{
    Metronome m;
    m.prepare (48000.0);
    m.start (0, 120.0, 4);

    auto beats = run (m, 0, 24000 * 2 + 10, 128);   // Schlaege bei 0, 24000, 48000
    REQUIRE (beats.size() == 3);
    m.setTempo (60.0, 4);                            // naechster Schlag liegt fest bei 72000
    const auto more = run (m, 24000 * 2 + 10, 72000 + 48000 + 10, 128);
    REQUIRE (more.size() == 2);
    CHECK (more[0].sample == 72000);
    CHECK (more[1].sample == 72000 + 48000);
}
