#include "audio/LevelMeter.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <cmath>
#include <numbers>
#include <vector>

using Catch::Matchers::WithinAbs;

TEST_CASE ("dB-Umrechnung")
{
    CHECK_THAT (ft::gainToDb (1.0f), WithinAbs (0.0, 1e-5));
    CHECK_THAT (ft::gainToDb (0.5f), WithinAbs (-6.0206, 1e-3));
    CHECK (ft::gainToDb (0.0f) == ft::minusInfinityDb);
    CHECK (ft::gainToDb (1e-9f) == ft::minusInfinityDb);

    CHECK_THAT (ft::dbToGain (0.0f), WithinAbs (1.0, 1e-6));
    CHECK_THAT (ft::dbToGain (-20.0f), WithinAbs (0.1, 1e-6));
    CHECK (ft::dbToGain (ft::minusInfinityDb) == 0.0f);
}

TEST_CASE ("Sinus: RMS = Spitze - 3 dB")
{
    const int n = 48000;
    std::vector<float> sine (n);
    for (int i = 0; i < n; ++i)
        sine[static_cast<size_t> (i)] = 0.5f * static_cast<float> (std::sin (2.0 * std::numbers::pi * 440.0 * i / 48000.0));

    ft::LevelAccumulator acc;
    acc.add (ft::measureBlock (sine.data(), n));

    CHECK_THAT (acc.getPeakDb(), WithinAbs (-6.0206, 0.01));
    CHECK_THAT (acc.getRmsDb(),  WithinAbs (-6.0206 - 3.0103, 0.01));
}

TEST_CASE ("Akkumulator gewichtet Bloecke nach Samplezahl")
{
    std::vector<float> loud (100, 1.0f);
    std::vector<float> silent (300, 0.0f);

    ft::LevelAccumulator acc;
    acc.add (ft::measureBlock (loud.data(), 100));
    acc.add (ft::measureBlock (silent.data(), 300));

    // mittlere Leistung = 100/400 = 0.25 -> RMS 0.5 -> -6.02 dB
    CHECK_THAT (acc.getRmsDb(), WithinAbs (-6.0206, 1e-3));
    CHECK_THAT (acc.getPeakDb(), WithinAbs (0.0, 1e-5));
}

TEST_CASE ("Gate-Status: offen, wenn in einem Block offen")
{
    ft::LevelFrame a, b;
    a.gateOpen = false;
    b.gateOpen = true;

    ft::LevelAccumulator acc;
    acc.add (a);
    CHECK_FALSE (acc.wasGateOpen());
    acc.add (b);
    CHECK (acc.wasGateOpen());

    acc.reset();
    CHECK (acc.isEmpty());
    CHECK_FALSE (acc.wasGateOpen());
    CHECK (acc.getRmsDb() == ft::minusInfinityDb);
}

TEST_CASE ("Leerer Block liefert Stille")
{
    const auto f = ft::measureBlock (nullptr, 0);
    CHECK (f.numSamples == 0);
    CHECK (f.peak == 0.0f);
}
