#include "audio/Effects.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <cmath>
#include <numbers>
#include <random>

using Catch::Matchers::WithinAbs;
using namespace ft;

namespace
{
    constexpr double sr = 48000.0;

    std::vector<float> sine (double hz, double sec, double amplitude)
    {
        std::vector<float> s (static_cast<size_t> (sec * sr));
        for (size_t i = 0; i < s.size(); ++i)
            s[i] = static_cast<float> (amplitude * std::sin (2.0 * std::numbers::pi * hz * static_cast<double> (i) / sr));
        return s;
    }

    struct Stereo { std::vector<float> l, r; };

    Stereo run (const EffectParameters& p, const std::vector<float>& in)
    {
        EffectChain chain;
        chain.setParameters (p);
        chain.prepare (sr);
        Stereo out { std::vector<float> (in.size()), std::vector<float> (in.size()) };
        for (size_t pos = 0; pos < in.size(); pos += 256) // in Bloecken wie im Audio-Thread
        {
            const auto n = static_cast<int> (std::min<size_t> (256, in.size() - pos));
            chain.process (in.data() + pos, out.l.data() + pos, out.r.data() + pos, n);
        }
        return out;
    }

    /** Pegel (dB) einer Frequenz im Abschnitt [from, to) (Goertzel, Hann). */
    double levelDb (const std::vector<float>& x, double hz, size_t from, size_t to)
    {
        const auto n = to - from;
        const auto w = 2.0 * std::numbers::pi * hz / sr;
        const auto coeff = 2.0 * std::cos (w);
        double s1 = 0.0, s2 = 0.0, win = 0.0;
        for (size_t i = 0; i < n; ++i)
        {
            const auto h = 0.5 - 0.5 * std::cos (2.0 * std::numbers::pi * static_cast<double> (i) / static_cast<double> (n));
            win += h;
            const auto s0 = x[from + i] * h + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        const auto mag = std::sqrt (std::max (0.0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) * 2.0 / win;
        return 20.0 * std::log10 (std::max (mag, 1e-12));
    }

    double peakDb (const std::vector<float>& x, size_t from, size_t to)
    {
        float p = 0.0f;
        for (auto i = from; i < to; ++i)
            p = std::max (p, std::abs (x[i]));
        return 20.0 * std::log10 (std::max (p, 1e-9f));
    }
}

TEST_CASE ("Effekte: ohne Effekte kommt das Signal unveraendert an")
{
    const auto in = sine (220.0, 0.5, 0.5);
    const auto out = run ({}, in);
    for (size_t i = 0; i < in.size(); ++i)
    {
        REQUIRE (out.l[i] == in[i]);
        REQUIRE (out.r[i] == in[i]);
    }
}

TEST_CASE ("Effekte: Equalizer hebt und senkt die eingestellten Bereiche")
{
    EffectParameters p;
    p.eqOn = true;
    p.eqMidDb = 6.0f;
    p.eqMidHz = 800.0f;
    p.eqBassDb = -6.0f;
    const auto mid = run (p, sine (800.0, 1.0, 0.25));
    CHECK_THAT (levelDb (mid.l, 800.0, 24000, 48000) - 20.0 * std::log10 (0.25), WithinAbs (6.0, 0.6));
    const auto bass = run (p, sine (40.0, 1.0, 0.25));
    CHECK_THAT (levelDb (bass.l, 40.0, 24000, 48000) - 20.0 * std::log10 (0.25), WithinAbs (-6.0, 0.8));
    const auto other = run (p, sine (8000.0, 1.0, 0.25)); // weit weg von beiden Baendern
    CHECK_THAT (levelDb (other.l, 8000.0, 24000, 48000) - 20.0 * std::log10 (0.25), WithinAbs (0.0, 0.5));
}

TEST_CASE ("Effekte: Kompressor senkt laute Signale gemaess Schwelle und Verhaeltnis")
{
    EffectParameters p;
    p.compressorOn = true;
    p.compThresholdDb = -20.0f;
    p.compRatio = 4.0f;
    p.compMakeupDb = 0.0f;
    // Spitze -6 dB: 14 dB ueber der Schwelle -> 3,5 dB darueber bleiben -> etwa -16,5 dB
    const auto loud = run (p, sine (200.0, 1.5, 0.5));
    CHECK_THAT (peakDb (loud.l, 48000, 72000), WithinAbs (-16.5, 1.5));
    // Unter der Schwelle bleibt der Pegel
    const auto quiet = run (p, sine (200.0, 1.5, 0.05));
    CHECK_THAT (peakDb (quiet.l, 48000, 72000), WithinAbs (20.0 * std::log10 (0.05), 0.3));
}

TEST_CASE ("Effekte: Verzerrung erzeugt Obertoene und bleibt begrenzt")
{
    for (const int mode : { 0, 1, 2 })
    {
        INFO ("Modus " << mode);
        EffectParameters p;
        p.driveOn = true;
        p.driveMode = mode;
        p.driveDb = 24.0f;
        p.driveTone = 1.0f;
        p.driveLevelDb = 0.0f;
        const auto out = run (p, sine (220.0, 1.0, 0.3));
        const auto fundamental = levelDb (out.l, 220.0, 12000, 36000);
        CHECK (levelDb (out.l, 660.0, 12000, 36000) > fundamental - 25.0); // deutlicher 3. Oberton
        CHECK (peakDb (out.l, 12000, 36000) < 3.0);                         // keine Pegelexplosion
        if (mode == 1)
            CHECK (levelDb (out.l, 440.0, 12000, 36000) > fundamental - 40.0); // asymmetrisch: auch 2. Oberton
    }

    SECTION ("Clean-Anteil erhaelt das Originalsignal")
    {
        EffectParameters p;
        p.driveOn = true;
        p.driveBlend = 1.0f;
        const auto in = sine (55.0, 0.5, 0.3);
        const auto out = run (p, in);
        CHECK_THAT (levelDb (out.l, 55.0, 12000, 24000), WithinAbs (20.0 * std::log10 (0.3), 0.3));
    }
}

TEST_CASE ("Effekte: Delay wiederholt nach der eingestellten Zeit, Fahne klingt nach dem Ausschalten aus")
{
    EffectParameters p;
    p.delayOn = true;
    p.delayMs = 250.0f;
    p.delayFeedback = 0.5f;
    p.delayMix = 1.0f;
    std::vector<float> in (static_cast<size_t> (sr), 0.0f);
    in[100] = 1.0f;
    const auto out = run (p, in);
    const auto echo = static_cast<size_t> (100 + 0.25 * sr);
    auto loudestNear = [&] (size_t at)
    {
        size_t best = at - 50;
        for (auto i = at - 50; i < at + 50; ++i)
            if (std::abs (out.l[i]) > std::abs (out.l[best]))
                best = i;
        return best;
    };
    CHECK (loudestNear (echo) == echo);
    CHECK (std::abs (out.l[loudestNear (echo + 12000)]) < std::abs (out.l[echo])); // zweites Echo leiser
    CHECK (std::abs (out.l[loudestNear (echo + 12000)]) > 0.1f);
}

TEST_CASE ("Effekte: Hall und Chorus bleiben stabil und klingen aus")
{
    EffectParameters p;
    p.reverbOn = true;
    p.reverbSize = 0.9f;
    p.reverbMix = 0.5f;
    p.chorusOn = true;
    std::vector<float> in (static_cast<size_t> (4 * sr), 0.0f);
    std::mt19937 rng (3);
    std::normal_distribution<float> noise (0.0f, 0.2f);
    for (size_t i = 0; i < static_cast<size_t> (0.3 * sr); ++i)
        in[i] = noise (rng);
    const auto out = run (p, in);
    for (size_t i = 0; i < out.l.size(); ++i)
        REQUIRE (std::isfinite (out.l[i]));
    const auto early = peakDb (out.l, static_cast<size_t> (0.4 * sr), static_cast<size_t> (0.6 * sr));
    const auto late = peakDb (out.l, static_cast<size_t> (3.5 * sr), static_cast<size_t> (4 * sr));
    CHECK (early > -40.0);       // Hallfahne nach dem Signal
    CHECK (late < early - 20.0); // klingt aus
    CHECK (out.l != out.r);      // stereo
}

TEST_CASE ("Effekte: Werte ausserhalb der Bereiche werden begrenzt")
{
    EffectParameters p;
    p.delayFeedback = 3.0f;
    p.compRatio = 0.0f;
    p.driveMode = 7;
    const auto c = p.clamped();
    CHECK (c.delayFeedback == 0.95f);
    CHECK (c.compRatio == 1.0f);
    CHECK (c.driveMode == 2);
}
