#include "audio/DriftResampler.h"

#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <numbers>
#include <thread>
#include <vector>

namespace
{
    struct SimResult
    {
        std::vector<float> out;
        ft::DriftResampler::Stats stats;
    };

    /** Zwei Geraete mit eigener Uhr simulieren: Eingang liefert einen Sinus mit inRate * (1 + driftPpm),
        Ausgang holt Bloecke mit outRate. Ereignisse werden nach Zeit geordnet abgearbeitet. */
    SimResult simulate (double inRate, double outRate, double driftPpm, int inBlock, int outBlock,
                        double seconds, double hz)
    {
        ft::DriftResampler r;
        r.prepare (inRate, outRate, inBlock, outBlock);

        const auto realInRate = inRate * (1.0 + driftPpm * 1.0e-6);
        const auto inPeriod = inBlock / realInRate;
        const auto outPeriod = outBlock / outRate;

        SimResult res;
        std::vector<float> inBuf (static_cast<size_t> (inBlock)), outBuf (static_cast<size_t> (outBlock));
        long long inSample = 0;
        double tIn = 0.0, tOut = 0.003; // Ausgang startet etwas versetzt

        while (tOut < seconds)
        {
            if (tIn <= tOut)
            {
                for (auto& s : inBuf)
                    s = static_cast<float> (0.5 * std::sin (2.0 * std::numbers::pi * hz * static_cast<double> (inSample++) / inRate));
                r.write (inBuf.data(), inBlock);
                tIn += inPeriod;
            }
            else
            {
                r.read (outBuf.data(), outBlock);
                res.out.insert (res.out.end(), outBuf.begin(), outBuf.end());
                tOut += outPeriod;
            }
        }

        res.stats = r.getStats();
        return res;
    }

    /** Frequenz ueber Nulldurchgaenge im Bereich [from, end). */
    double measureHz (const std::vector<float>& x, size_t from, double rate)
    {
        int crossings = 0;
        size_t first = 0, last = 0;
        for (size_t i = from + 1; i < x.size(); ++i)
        {
            if (x[i - 1] < 0.0f && x[i] >= 0.0f)
            {
                const auto pos = i;
                if (crossings == 0) first = pos;
                last = pos;
                ++crossings;
            }
        }
        return crossings > 1 ? (crossings - 1) * rate / static_cast<double> (last - first) : 0.0;
    }

    float maxStep (const std::vector<float>& x, size_t from)
    {
        float m = 0.0f;
        for (size_t i = from + 1; i < x.size(); ++i)
            m = std::max (m, std::abs (x[i] - x[i - 1]));
        return m;
    }
}

TEST_CASE ("DriftResampler: gleiche Uhr, keine Aussetzer, Tonhoehe bleibt")
{
    const auto r = simulate (48000.0, 48000.0, 0.0, 256, 512, 20.0, 440.0);
    CHECK (r.stats.underruns == 0);
    CHECK (r.stats.overruns == 0);
    CHECK (measureHz (r.out, 48000 * 5, 48000.0) == Catch::Approx (440.0).epsilon (0.0005));
}

TEST_CASE ("DriftResampler: Eingang schneller oder langsamer als Ausgang")
{
    for (const auto drift : { 300.0, -300.0, 80.0, -1200.0 })
    {
        INFO ("Drift " << drift << " ppm");
        const auto r = simulate (48000.0, 48000.0, drift, 64, 480, 120.0, 330.0);
        CHECK (r.stats.underruns == 0);
        CHECK (r.stats.overruns == 0);
        // Regler hat die Drift gefunden und den Fuellstand ans Soll gebracht
        CHECK (r.stats.ratioPpm == Catch::Approx (drift).margin (std::abs (drift) * 0.05 + 5.0));
        CHECK (std::abs (r.stats.fillSamples - r.stats.targetFill) < 64.0);
        // Ausgang auf seiner Uhr: Frequenz ist die des Eingangs relativ zur echten Zeit
        const auto expectedHz = 330.0 * (1.0 + drift * 1.0e-6);
        CHECK (measureHz (r.out, 48000 * 60, 48000.0) == Catch::Approx (expectedHz).epsilon (0.0002));
        // Kein Knacken: Sprung von Sample zu Sample nie groesser als beim reinen Sinus (+ Reserve)
        const auto sineStep = 0.5 * 2.0 * std::numbers::pi * 330.0 / 48000.0;
        CHECK (maxStep (r.out, 48000) < static_cast<float> (sineStep * 1.1));
    }
}

TEST_CASE ("DriftResampler: unterschiedliche Nennraten (48 kHz -> 44,1 kHz)")
{
    const auto r = simulate (48000.0, 44100.0, 150.0, 48, 441, 60.0, 196.0);
    CHECK (r.stats.underruns == 0);
    CHECK (r.stats.overruns == 0);
    CHECK (measureHz (r.out, 44100 * 30, 44100.0) == Catch::Approx (196.0).epsilon (0.0005));
}

TEST_CASE ("DriftResampler: Eingang faellt aus und kommt wieder")
{
    ft::DriftResampler r;
    r.prepare (48000.0, 48000.0, 128, 128);
    std::vector<float> in (128, 0.25f), out (128);

    for (int i = 0; i < 100; ++i) { r.write (in.data(), 128); r.read (out.data(), 128); }
    CHECK (out[64] == Catch::Approx (0.25f));

    // Eingang weg: Leser bekommt Stille, zaehlt hoechstens einen Aussetzer
    for (int i = 0; i < 10; ++i) r.read (out.data(), 128);
    CHECK (out[64] == 0.0f);
    CHECK (r.getStats().underruns == 1);

    // Eingang wieder da: nach dem Auffuellen kommt das Signal wieder
    for (int i = 0; i < 20; ++i) { r.write (in.data(), 128); r.read (out.data(), 128); }
    CHECK (out[64] == Catch::Approx (0.25f));
}

TEST_CASE ("DriftResampler: Ausgang steht, Eingang laeuft weiter")
{
    ft::DriftResampler r;
    r.prepare (48000.0, 48000.0, 128, 128);
    std::vector<float> in (128, 0.5f), out (128);

    for (int i = 0; i < 1000; ++i) r.write (in.data(), 128); // Ueberlauf -> verworfen, kein Absturz
    CHECK (r.getStats().overruns > 0);

    r.read (out.data(), 128); // synchronisiert neu
    for (int i = 0; i < 20; ++i) { r.write (in.data(), 128); r.read (out.data(), 128); }
    CHECK (out[100] == Catch::Approx (0.5f));
}

TEST_CASE ("DriftResampler: Schreiber und Leser in getrennten Threads")
{
    ft::DriftResampler r;
    r.prepare (48000.0, 48000.0, 64, 64);
    std::atomic<bool> stop { false };

    std::thread writer ([&]
    {
        std::vector<float> in (64);
        long long n = 0;
        while (! stop.load())
        {
            for (auto& s : in) s = static_cast<float> (0.5 * std::sin (0.05 * static_cast<double> (n++)));
            r.write (in.data(), 64);
            std::this_thread::yield();
        }
    });

    std::vector<float> out (64);
    for (int i = 0; i < 20000; ++i)
    {
        r.read (out.data(), 64);
        for (auto v : out)
            REQUIRE (std::abs (v) <= 0.55f);
        std::this_thread::yield();
    }
    stop = true;
    writer.join();
}
