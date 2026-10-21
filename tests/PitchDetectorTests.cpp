#include "audio/Fft.h"
#include "audio/MusicMath.h"
#include "audio/PitchDetector.h"
#include "support/Synth.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <cmath>
#include <complex>
#include <numbers>
#include <random>

using Catch::Matchers::WithinAbs;
using namespace ft;

namespace
{
    PitchDetector makeDetector (double sr, float minHz, float maxHz = 1500.0f)
    {
        PitchDetector d;
        PitchDetector::Config c;
        c.sampleRate = sr;
        c.minHz = minHz;
        c.maxHz = maxHz;
        d.prepare (c);
        return d;
    }

    double centsBetween (double measuredHz, double trueHz) { return 1200.0 * std::log2 (measuredHz / trueHz); }
}

TEST_CASE ("FFT stimmt mit naiver DFT ueberein")
{
    constexpr int n = 64;
    Fft fft;
    fft.prepare (n);

    std::mt19937 rng (3);
    std::uniform_real_distribution<float> dist (-1.0f, 1.0f);
    std::vector<std::complex<float>> x (n), X (n);
    for (auto& v : x)
        v = { dist (rng), dist (rng) };

    for (int k = 0; k < n; ++k)
    {
        std::complex<double> sum;
        for (int j = 0; j < n; ++j)
            sum += std::complex<double> (x[static_cast<size_t> (j)]) * std::polar (1.0, -2.0 * std::numbers::pi * j * k / n);
        X[static_cast<size_t> (k)] = std::complex<float> (sum);
    }

    auto y = x;
    fft.forward (y.data());
    for (int k = 0; k < n; ++k)
        REQUIRE (std::abs (y[static_cast<size_t> (k)] - X[static_cast<size_t> (k)]) < 1e-4f);

    fft.inverse (y.data());
    for (int k = 0; k < n; ++k)
        REQUIRE (std::abs (y[static_cast<size_t> (k)] - x[static_cast<size_t> (k)]) < 1e-5f);
}

TEST_CASE ("Notennamen und Umrechnung")
{
    CHECK (midiToName (40) == "E2");
    CHECK (midiToName (23) == "B0");
    CHECK (midiToName (61) == "C#4");
    CHECK (midiToName (69) == "A4");
    CHECK (nearestNote (440.0).midi == 69);
    CHECK_THAT (nearestNote (midiToHz (40.2)).cents, WithinAbs (20.0, 1e-3));
    CHECK_THAT (nearestNote (midiToHz (39.7)).cents, WithinAbs (-30.0, 1e-3));
    CHECK (nearestNote (midiToHz (39.7)).midi == 40);
}

TEST_CASE ("Fenstergroesse folgt der tiefsten Frequenz")
{
    CHECK (makeDetector (48000, 55).getFrameSize() == 2048);
    CHECK (makeDetector (48000, 28).getFrameSize() == 4096);
    CHECK (makeDetector (44100, 28).getFrameSize() == 4096);
    CHECK (makeDetector (96000, 55).getFrameSize() == 4096);
}

TEST_CASE ("Sinustoene von 31 Hz bis 1.3 kHz: richtige Note und Oktave, < 3 Cent Fehler")
{
    const auto sr = GENERATE (44100.0, 48000.0);
    auto det = makeDetector (sr, 28.0f);

    for (int midi = 23; midi <= 88; ++midi)
    {
        const auto hz = midiToHz (midi);
        const auto signal = test::sine (hz, 0.2, sr);
        const auto r = det.detect (signal.data() + 1000);

        INFO ("sr=" << sr << " midi=" << midi << " (" << midiToName (midi) << ") gemessen " << r.hz << " Hz");
        REQUIRE (r.voiced);
        REQUIRE (nearestNote (r.hz).midi == midi);
        REQUIRE (std::abs (centsBetween (r.hz, hz)) < 3.0);
    }
}

TEST_CASE ("Gezupfte Gitarrentoene E2 bis E6")
{
    auto det = makeDetector (48000, 55.0f);

    for (int midi = 40; midi <= 88; ++midi)
    {
        const auto signal = test::renderNotes ({ { 0.0, midiToHz (midi) } }, 0.3, 48000);
        const auto r = det.detect (signal.data() + 4800); // 100 ms nach dem Anschlag

        INFO ("midi=" << midi << " (" << midiToName (midi) << ") gemessen " << r.hz << " Hz");
        REQUIRE (r.voiced);
        REQUIRE (nearestNote (r.hz).midi == midi);
    }
}

TEST_CASE ("Bass mit schwachem Grundton: Oktave bleibt richtig (tiefes H bis G2)")
{
    auto det = makeDetector (48000, 28.0f, 800.0f);

    test::Voice bass;
    bass.fundamentalLevel = 0.25;
    bass.brightness = 0.8;
    bass.inharmonicity = 2e-4;

    for (int midi = 23; midi <= 43; ++midi)
    {
        const auto signal = test::renderNotes ({ { 0.0, midiToHz (midi) } }, 0.4, 48000, bass);
        const auto r = det.detect (signal.data() + 9600); // 200 ms nach dem Anschlag

        INFO ("midi=" << midi << " (" << midiToName (midi) << ") gemessen " << r.hz << " Hz");
        REQUIRE (r.voiced);
        REQUIRE (nearestNote (r.hz).midi == midi);
    }
}

TEST_CASE ("Stille und Rauschen sind stimmlos")
{
    auto det = makeDetector (48000, 55.0f);
    std::vector<float> silence (static_cast<size_t> (det.getFrameSize()), 0.0f);
    CHECK_FALSE (det.detect (silence.data()).voiced);

    std::mt19937 rng (7);
    std::normal_distribution<float> gauss (0.0f, 0.1f);
    std::vector<float> noise (static_cast<size_t> (det.getFrameSize()));
    for (auto& v : noise)
        v = gauss (rng);
    CHECK_FALSE (det.detect (noise.data()).voiced);
}
