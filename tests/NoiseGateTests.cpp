#include "audio/NoiseGate.h"
#include "audio/LevelMeter.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <vector>

using Catch::Matchers::WithinAbs;

namespace
{
    constexpr double sr = 48000.0;

    int msToSamples (double ms) { return static_cast<int> (ms * 0.001 * sr); }

    std::vector<float> constant (float value, int n) { return std::vector<float> (static_cast<size_t> (n), value); }

    ft::NoiseGate makeGate (ft::NoiseGate::Parameters p)
    {
        ft::NoiseGate g;
        g.prepare (sr);
        g.setParameters (p);
        return g;
    }

    void run (ft::NoiseGate& g, std::vector<float>& buf) { g.process (buf.data(), static_cast<int> (buf.size())); }
}

TEST_CASE ("Gate bleibt bei Signal unter der Schwelle geschlossen")
{
    auto g = makeGate ({ -40.0f, 1.0f, 10.0f, 10.0f, 6.0f });
    auto buf = constant (ft::dbToGain (-50.0f), msToSamples (100));
    run (g, buf);

    CHECK_FALSE (g.isOpen());
    for (auto s : buf)
        REQUIRE (s == 0.0f);
}

TEST_CASE ("Gate oeffnet ueber der Schwelle und erreicht volle Verstaerkung nach Attack")
{
    auto g = makeGate ({ -40.0f, 5.0f, 10.0f, 10.0f, 6.0f });
    const auto level = ft::dbToGain (-20.0f);
    auto buf = constant (level, msToSamples (20));
    run (g, buf);

    CHECK (g.isOpen());
    CHECK_THAT (g.getCurrentGain(), WithinAbs (1.0, 1e-6));

    // Attack-Rampe: nach der Haelfte der Attackzeit ca. halbe Verstaerkung
    const auto half = static_cast<size_t> (msToSamples (2.5));
    CHECK_THAT (buf[half] / level, WithinAbs (0.5, 0.01));
    CHECK_THAT (buf.back(), WithinAbs (level, 1e-6));
}

TEST_CASE ("Hold haelt das Gate nach Signalende offen")
{
    const float holdMs = 50.0f;
    auto g = makeGate ({ -40.0f, 0.0f, holdMs, 10.0f, 6.0f });

    // -30 dB liegt 16 dB ueber der Schliessschwelle (-46 dB); die Detektor-Huellkurve
    // (Zeitkonstante 10 ms) braucht ca. 18.4 ms, um darunter zu fallen. Danach laeuft Hold.
    auto loud = constant (ft::dbToGain (-30.0f), msToSamples (10));
    run (g, loud);
    REQUIRE (g.isOpen());

    auto silence = constant (0.0f, msToSamples (60)); // < 18.4 + 50 ms
    run (g, silence);
    CHECK (g.isOpen());

    auto more = constant (0.0f, msToSamples (20));    // insgesamt 80 ms > 68.4 ms
    run (g, more);
    CHECK_FALSE (g.isOpen());
}

TEST_CASE ("Release blendet linear aus")
{
    const float releaseMs = 20.0f;
    auto g = makeGate ({ -40.0f, 0.0f, 0.0f, releaseMs, 6.0f });

    auto loud = constant (ft::dbToGain (-10.0f), msToSamples (10));
    run (g, loud);
    REQUIRE (g.getCurrentGain() == 1.0f);

    // Huellkurve faellt von -10 dB auf die Schliessschwelle (-46 dB) in ca. 41.4 ms,
    // dann schliesst das Gate (Hold = 0) und die Verstaerkung faellt in releaseMs auf 0.
    auto quiet = constant (ft::dbToGain (-60.0f), msToSamples (50));
    run (g, quiet);
    CHECK_FALSE (g.isOpen());
    CHECK_THAT (g.getCurrentGain(), WithinAbs (1.0 - (50.0 - 41.4) / releaseMs, 0.05));

    auto rest = constant (ft::dbToGain (-60.0f), msToSamples (releaseMs));
    run (g, rest);
    CHECK (g.getCurrentGain() == 0.0f);
}

TEST_CASE ("Hysterese: Pegel zwischen Schliess- und Oeffnungsschwelle haelt das Gate offen")
{
    auto g = makeGate ({ -40.0f, 0.0f, 0.0f, 10.0f, 10.0f });

    auto loud = constant (ft::dbToGain (-30.0f), msToSamples (10));
    run (g, loud);
    REQUIRE (g.isOpen());

    // -45 dB: unter der Oeffnungsschwelle (-40), ueber der Schliessschwelle (-50)
    auto middle = constant (ft::dbToGain (-45.0f), msToSamples (200));
    run (g, middle);
    CHECK (g.isOpen());

    // Aus geschlossenem Zustand oeffnet derselbe Pegel nicht
    g.reset();
    auto middle2 = constant (ft::dbToGain (-45.0f), msToSamples (200));
    run (g, middle2);
    CHECK_FALSE (g.isOpen());
}

TEST_CASE ("Ohne Hysterese schliesst das Gate unter der Schwelle")
{
    auto g = makeGate ({ -40.0f, 0.0f, 0.0f, 10.0f, 0.0f });

    auto loud = constant (ft::dbToGain (-30.0f), msToSamples (10));
    run (g, loud);
    REQUIRE (g.isOpen());

    auto below = constant (ft::dbToGain (-45.0f), msToSamples (100));
    run (g, below);
    CHECK_FALSE (g.isOpen());
}

TEST_CASE ("Parameter werden auf gueltige Werte begrenzt")
{
    auto g = makeGate ({ -40.0f, -5.0f, -1.0f, -3.0f, -6.0f });
    const auto& p = g.getParameters();
    CHECK (p.attackMs == 0.0f);
    CHECK (p.holdMs == 0.0f);
    CHECK (p.releaseMs == 0.0f);
    CHECK (p.hysteresisDb == 0.0f);
}
