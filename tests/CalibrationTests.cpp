#include "audio/Calibration.h"
#include "audio/LevelMeter.h"
#include "audio/MusicMath.h"
#include "support/AnalysisHelpers.h"
#include "support/Synth.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <random>

using Catch::Matchers::WithinAbs;
using namespace ft;

namespace
{
    constexpr double sr = 48000.0;

    NoteEvent ev (int midi, OnsetType t = OnsetType::pick) { return { midi, 0.0f, 0.0, t }; }
    ExpectedNote ex (int midi, OnsetType t = OnsetType::pick) { return { midi, t, std::nullopt }; }

    constexpr auto pick = OnsetType::pick;
    constexpr auto legato = OnsetType::legato;
}

TEST_CASE ("Bewertung: perfekte Aufnahme")
{
    const auto s = scoreTake ({ ex (40), ex (45), ex (47, legato) }, { ev (40), ev (45), ev (47, legato) });
    CHECK (s.correct == 3);
    CHECK (s.errorCost == 0.0);
    CHECK (s.accuracy == 1.0);
    REQUIRE (s.alignment.size() == 3);
    CHECK (s.alignment[2].expectedIndex == 2);
    CHECK (s.alignment[2].detectedIndex == 2);
}

TEST_CASE ("Bewertung: fehlende, zusaetzliche und falsche Noten")
{
    SECTION ("fehlende Note in der Mitte")
    {
        const auto s = scoreTake ({ ex (40), ex (45), ex (50) }, { ev (40), ev (50) });
        CHECK (s.missing == 1);
        CHECK (s.correct == 2);
        CHECK (s.alignment[1].kind == AlignKind::missing);
        CHECK (s.alignment[1].expectedIndex == 1);
        CHECK_THAT (s.accuracy, WithinAbs (2.0 / 3.0, 1e-9));
    }

    SECTION ("doppelt erkannte Note")
    {
        const auto s = scoreTake ({ ex (40), ex (45) }, { ev (40), ev (40), ev (45) });
        CHECK (s.extra == 1);
        CHECK (s.correct == 2);
    }

    SECTION ("falsche Tonhoehe (Oktavfehler)")
    {
        const auto s = scoreTake ({ ex (40), ex (45) }, { ev (52), ev (45) });
        CHECK (s.wrongPitch == 1);
        CHECK (s.alignment[0].kind == AlignKind::wrongPitch);
    }

    SECTION ("Legato als Anschlag erkannt zaehlt halb")
    {
        const auto s = scoreTake ({ ex (45), ex (47, legato) }, { ev (45), ev (47, pick) });
        CHECK (s.wrongType == 1);
        CHECK (s.errorCost == 0.5);
        CHECK_THAT (s.accuracy, WithinAbs (0.75, 1e-9));
    }

    SECTION ("nichts erkannt")
    {
        const auto s = scoreTake ({ ex (40), ex (45) }, {});
        CHECK (s.missing == 2);
        CHECK (s.accuracy == 0.0);
    }
}

TEST_CASE ("Replay mit anderem Tuning entspricht einer vollstaendigen Analyse")
{
    test::Voice v;
    v.legatoClick = 0.5;
    const auto signal = test::renderNotes ({ { 0.2, midiToHz (45) }, { 0.5, midiToHz (47), true }, { 0.8, midiToHz (48), true },
                                             { 1.1, midiToHz (52) }, { 1.3, midiToHz (52) }, { 1.6, midiToHz (40) } },
                                           2.0, sr, v);

    Analyzer::Recording rec;
    OfflineOptions o;
    o.recording = &rec;
    analyseOffline (signal, sr, o);
    REQUIRE_FALSE (rec.hops.empty());

    for (const auto& tuning : { DetectionTuning {}, DetectionTuning { 1.5f, 3.0f, 1.2f, 2 },
                                DetectionTuning { 6.0f, 10.0f, 2.0f, 4 }, DetectionTuning { 3.0f, 7.0f, 1.5f, 3 } })
    {
        OfflineOptions full;
        full.tuning = tuning;
        const auto expected = analyseOffline (signal, sr, full);
        const auto replayed = Analyzer::replay (rec, tuning);

        REQUIRE (replayed.notes.size() == expected.notes.size());
        REQUIRE (replayed.onsets == expected.onsets);
        for (size_t i = 0; i < replayed.notes.size(); ++i)
        {
            CHECK (replayed.notes[i].midi == expected.notes[i].event.midi);
            CHECK (replayed.notes[i].onsetType == expected.notes[i].event.onsetType);
            CHECK (replayed.notes[i].timeSec == expected.notes[i].event.timeSec);
        }
    }
}

TEST_CASE ("Grundrauschen und Gate-Vorschlag")
{
    std::mt19937 rng (5);
    std::normal_distribution<float> gauss (0.0f, dbToGain (-70.0f));
    std::vector<float> noise (static_cast<size_t> (3 * sr));
    for (auto& s : noise)
        s = gauss (rng);

    auto p = measureNoise (noise, sr);
    CHECK_THAT (p.rmsDb, WithinAbs (-70.0, 0.5));
    CHECK (p.peakDb > p.rmsDb + 9.0); // Gauss: Spitzen liegen deutlich ueber dem Effektivwert
    CHECK (p.quiet);
    CHECK_THAT (p.suggestedGateDb, WithinAbs (p.typicalPeakDb + 6.0, 0.5));

    SECTION ("ein einzelnes Klacken verschiebt den Vorschlag nicht")
    {
        auto withClick = noise;
        for (size_t i = 0; i < 100; ++i)
            withClick[static_cast<size_t> (1.5 * sr) + i] = 0.03f; // ca. -30 dBFS fuer 2 ms
        const auto q = measureNoise (withClick, sr);
        CHECK (q.peakDb > -31.0f);
        CHECK_THAT (q.suggestedGateDb, WithinAbs (p.suggestedGateDb, 0.5));
        CHECK (q.quiet);
    }

    SECTION ("klingende Saite ist keine Ruhe, Vorschlag bleibt begrenzt")
    {
        auto ringing = test::sine (55.0, 3.0, sr, 0.05); // ca. -26 dBFS
        const auto q = measureNoise (ringing, sr);
        CHECK_FALSE (q.quiet);
        CHECK (q.suggestedGateDb == maxSuggestedGateDb);
    }
}

TEST_CASE ("Optimierung behaelt die Parameter, wenn alles stimmt")
{
    const auto signal = test::renderNotes ({ { 0.2, midiToHz (40) }, { 0.6, midiToHz (45) }, { 1.0, midiToHz (47), true } }, 1.5, sr);
    ExpectedNotes expected;
    expected.notes = { ex (40), ex (45), ex (47, legato) };

    const std::vector takes { makeCalibrationTake (signal, sr, expected, {}) };
    const DetectionTuning current;
    const auto r = optimiseTuning (takes, current);

    CHECK (r.current.totalCost == 0.0);
    CHECK (r.best.tuning == current);
    CHECK (r.combinationsTried == static_cast<int> (tuningCandidates().size()));
}

TEST_CASE ("Optimierung verbessert die Erkennung bei Hammer-ons mit Klick")
{
    // Echte Hammer-ons erzeugen einen kleinen Klick, der wie ein Anschlag aussehen kann
    const auto click = GENERATE (0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5);
    test::Voice v;
    v.legatoClick = click;

    std::vector<CalibrationTake> takes;
    for (int base : { 45, 52, 57 })
    {
        const auto signal = test::renderNotes ({ { 0.2, midiToHz (base) }, { 0.5, midiToHz (base + 2), true },
                                                 { 0.8, midiToHz (base + 3), true }, { 1.1, midiToHz (base + 2), true },
                                                 { 1.4, midiToHz (base) }, { 1.7, midiToHz (base + 2), true } },
                                               2.1, sr, v, static_cast<unsigned> (base));
        ExpectedNotes e;
        e.notes = { ex (base), ex (base + 2, legato), ex (base + 3, legato), ex (base + 2, legato),
                    ex (base), ex (base + 2, legato) };
        takes.push_back (makeCalibrationTake (signal, sr, e, {}));
    }

    const auto r = optimiseTuning (takes, DetectionTuning {});
    INFO ("Klick " << click << ": Fehler vorher " << r.current.totalCost << ", nachher " << r.best.totalCost
          << " (Anstieg " << r.best.tuning.minRiseDb << " dB, Fluss x" << r.best.tuning.strongFluxFactor
          << ", Schwelle x" << r.best.tuning.fluxMultiplier << ", stabil " << r.best.tuning.stableFrames << ")");

    CHECK (r.best.totalCost <= r.current.totalCost);

    for (size_t t = 0; t < takes.size(); ++t)
    {
        const auto out = Analyzer::replay (takes[t].recording, r.best.tuning);
        std::string s;
        for (const auto& n : out.notes)
            s += midiToName (n.midi) + (n.onsetType == pick ? "/p@" : "/l@") + std::to_string (n.timeSec) + " ";
        UNSCOPED_INFO ("Aufnahme " << t << ": " << s);
    }

    CHECK (r.best.totalCost == 0.0);
}
