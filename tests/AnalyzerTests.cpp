#include "audio/MusicMath.h"
#include "support/AnalysisHelpers.h"
#include "support/Synth.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <sstream>

using Catch::Matchers::WithinAbs;
using namespace ft;

namespace
{
    constexpr double sr = 48000.0;

    std::string describe (const AnalysisRun& run)
    {
        std::ostringstream s;
        s << run.notes.size() << " Noten:";
        for (const auto& n : run.notes)
            s << " " << midiToName (n.event.midi) << (n.event.onsetType == OnsetType::pick ? "/pick" : "/legato")
              << "@" << n.event.timeSec;
        s << " | " << run.onsets.size() << " Anschlaege:";
        for (auto t : run.onsets)
            s << " " << t;
        return s.str();
    }

    struct Expected { int midi; OnsetType type; };

    void requireNotes (const AnalysisRun& run, const std::vector<Expected>& expected)
    {
        INFO (describe (run));
        REQUIRE (run.notes.size() == expected.size());
        for (size_t i = 0; i < expected.size(); ++i)
        {
            INFO ("Note " << i);
            CHECK (run.notes[i].event.midi == expected[i].midi);
            CHECK (run.notes[i].event.onsetType == expected[i].type);
        }
    }
}

TEST_CASE ("Anschlaege werden auf wenige Millisekunden genau erkannt")
{
    const std::vector<double> starts { 0.20, 0.65, 1.10, 1.40, 1.90 };
    const std::vector<int> midis { 40, 45, 52, 59, 64 };

    std::vector<test::SynthNote> notes;
    for (size_t i = 0; i < starts.size(); ++i)
        notes.push_back ({ starts[i], midiToHz (midis[i]) });

    const auto run = test::analyse (test::renderNotes (notes, 2.5, sr), sr);
    INFO (describe (run));

    REQUIRE (run.onsets.size() == starts.size());
    for (size_t i = 0; i < starts.size(); ++i)
        CHECK_THAT (run.onsets[i], WithinAbs (starts[i], 0.003));
}

TEST_CASE ("Ausklingender Ton erzeugt genau einen Anschlag")
{
    const auto run = test::analyse (test::renderNotes ({ { 0.1, midiToHz (45) } }, 3.0, sr), sr);
    INFO (describe (run));
    CHECK (run.onsets.size() == 1);
    requireNotes (run, { { 45, OnsetType::pick } });
}

TEST_CASE ("Gitarrenlauf: Noten, Oktaven und Zeitpunkte")
{
    const auto rate = GENERATE (44100.0, 48000.0, 96000.0);
    INFO ("Abtastrate " << rate);

    const std::vector<int> midis { 40, 45, 50, 55, 59, 64, 52, 76, 41, 88 };
    std::vector<test::SynthNote> notes;
    std::vector<Expected> expected;
    for (size_t i = 0; i < midis.size(); ++i)
    {
        notes.push_back ({ 0.2 + 0.3 * static_cast<double> (i), midiToHz (midis[i]) });
        expected.push_back ({ midis[i], OnsetType::pick });
    }

    const auto run = test::analyse (test::renderNotes (notes, 3.6, rate), rate);
    requireNotes (run, expected);

    for (size_t i = 0; i < notes.size(); ++i)
        CHECK_THAT (run.notes[i].event.timeSec, WithinAbs (notes[i].startSec, 0.003));
}

TEST_CASE ("Erkennungslatenz nach dem Anschlag unter 70 ms (Gitarre, 48 kHz)")
{
    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (40) }, { 0.7, midiToHz (64) } }, 1.2, sr), sr);
    REQUIRE (run.notes.size() == 2);
    for (const auto& n : run.notes)
        CHECK (n.emittedAtSec - n.event.timeSec < 0.070);
}

TEST_CASE ("Hammer-on und Pull-off werden als Legato erkannt")
{
    SECTION ("Hammer-on A2 -> B2 -> C3")
    {
        const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (45) },
                                                             { 0.6, midiToHz (47), true },
                                                             { 1.0, midiToHz (48), true } }, 1.5, sr), sr);
        requireNotes (run, { { 45, OnsetType::pick }, { 47, OnsetType::legato }, { 48, OnsetType::legato } });
        CHECK (run.onsets.size() == 1);
        CHECK_THAT (run.notes[1].event.timeSec, WithinAbs (0.6, 0.05));
    }

    SECTION ("Pull-off G3 -> F3 -> E3 und erneuter Anschlag")
    {
        const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (55) },
                                                             { 0.5, midiToHz (53), true },
                                                             { 0.8, midiToHz (52), true },
                                                             { 1.2, midiToHz (55) } }, 1.6, sr), sr);
        requireNotes (run, { { 55, OnsetType::pick }, { 53, OnsetType::legato },
                             { 52, OnsetType::legato }, { 55, OnsetType::pick } });
    }
}

TEST_CASE ("Wiederholter Anschlag derselben Note ergibt zwei Noten")
{
    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (57) }, { 0.6, midiToHz (57) },
                                                         { 1.0, midiToHz (57), false, -6.0 } }, 1.4, sr), sr);
    requireNotes (run, { { 57, OnsetType::pick }, { 57, OnsetType::pick }, { 57, OnsetType::pick } });
}

TEST_CASE ("Oktavspruenge werden nicht verwechselt")
{
    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (40) }, { 0.5, midiToHz (52) },
                                                         { 0.8, midiToHz (64) }, { 1.1, midiToHz (52) },
                                                         { 1.4, midiToHz (40) } }, 1.9, sr), sr);
    requireNotes (run, { { 40, OnsetType::pick }, { 52, OnsetType::pick }, { 64, OnsetType::pick },
                         { 52, OnsetType::pick }, { 40, OnsetType::pick } });
}

TEST_CASE ("Bass bis zum tiefen H")
{
    test::Voice bass;
    bass.fundamentalLevel = 0.25;
    bass.brightness = 0.8;
    bass.inharmonicity = 2e-4;
    bass.decayPerSec = 0.8;

    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (23) }, { 0.7, midiToHz (28) },
                                                         { 1.2, midiToHz (33) }, { 1.7, midiToHz (26), true } },
                                                       2.3, sr, bass),
                                    sr, 28.0f, 800.0f);
    requireNotes (run, { { 23, OnsetType::pick }, { 28, OnsetType::pick },
                         { 33, OnsetType::pick }, { 26, OnsetType::legato } });
}

TEST_CASE ("Verstimmung wird in Cent gemeldet")
{
    // Harmonischer Ton: bei inharmonischen Saiten liegt die "Tonhoehe" zwischen den
    // gespreizten Teiltoenen und ist nicht eindeutig definiert.
    test::Voice harmonic;
    harmonic.inharmonicity = 0.0;

    const auto cents = GENERATE (-35.0, -12.0, 0.0, 18.0, 40.0);
    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (50 + cents / 100.0) } }, 0.8, sr, harmonic), sr);
    REQUIRE (run.notes.size() == 1);
    CHECK (run.notes[0].event.midi == 50);
    CHECK_THAT (run.notes[0].event.cents, WithinAbs (cents, 3.0));
}

TEST_CASE ("Leises Signal unter der Gate-Schwelle wird ignoriert")
{
    test::Voice quiet;
    quiet.level = 0.001; // ca. -66 dBFS
    const auto run = test::analyse (test::renderNotes ({ { 0.2, midiToHz (45) } }, 1.0, sr, quiet), sr);
    CHECK (run.notes.empty());
    CHECK (run.onsets.empty());
}

TEST_CASE ("Nachklingender Ton: erwarteter Ton wird in der richtigen Oktave erkannt")
{
    // Bass: E2 (12. Bund E-Saite) klingt laut weiter, dann wird leise A1 auf der A-Saite angeschlagen.
    // Zusammen wiederholen sich beide erst mit 27,5 Hz (A0) -> typischer Oktavfehler.
    test::Voice ringing;
    ringing.fundamentalLevel = 0.6;
    ringing.decayPerSec = 0.3;
    ringing.decayPerHarmonic = 0.2;
    test::Voice soft = ringing;
    soft.level = 0.18;

    auto signal = test::renderNotes ({ { 0.2, midiToHz (40) } }, 2.0, sr, ringing, 3);
    const auto a1 = test::renderNotes ({ { 0.9, midiToHz (33) } }, 2.0, sr, soft, 4);
    for (size_t i = 0; i < signal.size(); ++i)
        signal[i] += a1[i];

    OfflineOptions o;
    o.minHz = 28.0f;
    o.maxHz = 800.0f;
    o.gate.thresholdDb = -60.0f;

    const auto plain = analyseOffline (signal, sr, o);
    std::string got;
    for (const auto& n : plain.notes)
        got += midiToName (n.event.midi) + " ";
    INFO ("ohne Erwartung: " << got);

    o.expectedSequence = { 40, 33 };
    const auto guided = analyseOffline (signal, sr, o);
    REQUIRE (guided.notes.size() >= 2);
    CHECK (guided.notes[0].event.midi == 40);
    CHECK (guided.notes[1].event.midi == 33);

    SECTION ("ohne nachklingenden Ton wird nichts verfaelscht: echte falsche Oktave bleibt falsch")
    {
        // A2 gespielt, A1 erwartet: der Grundton von A1 fehlt -> keine Korrektur
        const auto a2 = test::renderNotes ({ { 0.3, midiToHz (45) } }, 1.2, sr, ringing, 5);
        OfflineOptions w = o;
        w.expectedSequence = { 33 };
        const auto run = analyseOffline (a2, sr, w);
        REQUIRE (run.notes.size() == 1);
        CHECK (run.notes[0].event.midi == 45);
        CHECK_FALSE (run.notes[0].event.corrected);
    }
}

TEST_CASE ("Mitklingende leere Saite: nur neu angeschlagene Teiltoene zaehlen")
{
    // Bass: leere A-Saite (A1) klingt laut und lange, dann wird leise H2 bzw. C3 auf der G-Saite gespielt
    test::Voice openString;
    openString.fundamentalLevel = 0.8;
    openString.decayPerSec = 0.4;
    openString.decayPerHarmonic = 0.15;
    test::Voice soft;
    soft.level = GENERATE (0.25, 0.35, 0.5); // angeschlagener Ton 6 dB leiser bis gleich laut
    INFO ("Pegel angeschlagener Ton: " << soft.level);

    auto mix = [&] (int midi)
    {
        auto signal = test::renderNotes ({ { 0.2, midiToHz (33) } }, 2.2, sr, openString, 7);
        const auto note = test::renderNotes ({ { 1.0, midiToHz (midi) } }, 2.2, sr, soft, 8);
        for (size_t i = 0; i < signal.size(); ++i)
            signal[i] += note[i];
        return signal;
    };

    OfflineOptions o;
    o.minHz = 32.0f;
    o.maxHz = 390.0f;
    o.gate.thresholdDb = -60.0f;

    SECTION ("erwarteter Ton wird trotz klingender leerer Saite erkannt")
    {
        const auto signal = mix (47);
        const auto plain = analyseOffline (signal, sr, o);
        std::string got;
        for (const auto& n : plain.notes)
            got += midiToName (n.event.midi) + " ";
        INFO ("ohne Erwartung: " << got);

        o.expectedSequence = { 33, 47 };
        const auto run = analyseOffline (signal, sr, o);
        REQUIRE (run.notes.size() >= 2);
        CHECK (run.notes[0].event.midi == 33);
        CHECK (run.notes[1].event.midi == 47);
    }

    SECTION ("wirklich falscher Ton bleibt falsch")
    {
        const auto signal = mix (48); // C3 gespielt
        o.expectedSequence = { 33, 47 }; // H2 erwartet
        const auto run = analyseOffline (signal, sr, o);
        REQUIRE (run.notes.size() >= 2);
        CHECK (run.notes[1].event.midi != 47);
        CHECK_FALSE (run.notes[1].event.corrected);
    }
}

TEST_CASE ("Ergebnis haengt nicht von der Blockgroesse ab")
{
    const auto blockSize = GENERATE (32, 64, 441, 512, 1024);
    const auto signal = test::renderNotes ({ { 0.2, midiToHz (45) }, { 0.6, midiToHz (47), true }, { 1.0, midiToHz (52) } }, 1.4, sr);
    const auto run = test::analyse (signal, sr, 55.0f, 1500.0f, blockSize);
    requireNotes (run, { { 45, OnsetType::pick }, { 47, OnsetType::legato }, { 52, OnsetType::pick } });
}
