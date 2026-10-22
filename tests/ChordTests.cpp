#include "audio/Analyzer.h"
#include "audio/MusicMath.h"
#include "support/Synth.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>

#include <sstream>

using namespace ft;

namespace
{
    constexpr double sr = 48000.0;

    struct Strike { double startSec; int midi; };

    /** Jede Saite einzeln synthetisiert und gemischt (die Synthese ist einstimmig). */
    std::vector<float> strings (const std::vector<Strike>& strikes, double totalSec)
    {
        std::vector<float> mix (static_cast<size_t> (totalSec * sr), 0.0f);
        test::Voice v;
        v.level = 0.15;
        unsigned seed = 1;
        for (const auto& s : strikes)
        {
            const auto one = test::renderNotes ({ { s.startSec, midiToHz (s.midi) } }, totalSec, sr, v, seed++);
            for (size_t i = 0; i < mix.size(); ++i)
                mix[i] += one[i];
        }
        return mix;
    }

    std::vector<Analyzer::ChordEvent> chordsIn (const std::vector<float>& signal, std::vector<int> expected)
    {
        Analyzer a;
        Analyzer::Config c;
        c.sampleRate = sr;
        a.prepare (c);
        a.setExpectedNotes (std::move (expected));

        std::vector<Analyzer::ChordEvent> chords;
        Analyzer::Output out;
        for (size_t pos = 0; pos < signal.size(); pos += 128)
        {
            out.clear();
            a.process (signal.data() + pos, static_cast<int> (std::min<size_t> (128, signal.size() - pos)), true, out);
            chords.insert (chords.end(), out.chords.begin(), out.chords.end());
        }
        return chords;
    }

    std::string describe (const Analyzer::ChordEvent& c)
    {
        std::ostringstream s;
        s << "Akkord @" << c.timeSec << ":";
        for (int i = 0; i < c.count; ++i)
        {
            const auto& t = c.tones[static_cast<size_t> (i)];
            s << " " << midiToName (t.midi) << (t.present ? "+" : "-") << "(" << t.strength << "/" << t.freshRatio
              << (t.shared ? " geteilt" : "") << ")";
        }
        return s.str();
    }

    bool present (const Analyzer::ChordEvent& c, int midi)
    {
        for (int i = 0; i < c.count; ++i)
            if (c.tones[static_cast<size_t> (i)].midi == midi)
                return c.tones[static_cast<size_t> (i)].present;
        return false;
    }

    std::vector<Strike> at (double sec, std::vector<int> midis, double strumSec = 0.0)
    {
        std::vector<Strike> s;
        for (size_t i = 0; i < midis.size(); ++i)
            s.push_back ({ sec + static_cast<double> (i) * strumSec, midis[i] });
        return s;
    }
}

TEST_CASE ("Akkord: alle gespielten Akkordtoene werden erkannt")
{
    const auto chord = GENERATE (std::vector<int> { 45, 52, 57 },          // A5 (Powerchord)
                                 std::vector<int> { 48, 52, 55, 60, 64 },  // C-Dur offen
                                 std::vector<int> { 40, 47, 52, 56, 59, 64 }, // E-Dur offen
                                 std::vector<int> { 43, 47, 50, 55 });     // G-Dur (tiefe Saiten)
    const auto events = chordsIn (strings (at (0.3, chord), 1.2), chord);
    REQUIRE (events.size() == 1);
    INFO (describe (events[0]));
    CHECK (events[0].timeSec > 0.29);
    CHECK (events[0].timeSec < 0.33);
    for (const auto m : chord)
        CHECK (present (events[0], m));
}

TEST_CASE ("Akkord: fehlender Akkordton wird erkannt")
{
    const std::vector<int> cMajor { 48, 52, 55, 60, 64 };
    const auto missing = GENERATE (52, 55, 48); // E4 als Oktave von E3 ist nicht einzeln pruefbar (s. u.)
    std::vector<int> played;
    for (const auto m : cMajor)
        if (m != missing)
            played.push_back (m);

    const auto events = chordsIn (strings (at (0.3, played), 1.2), cMajor);
    REQUIRE (events.size() == 1);
    INFO ("fehlt: " << midiToName (missing) << " | " << describe (events[0]));
    CHECK_FALSE (present (events[0], missing));
    for (const auto m : played)
        CHECK (present (events[0], m));
}

TEST_CASE ("Akkord: Oktavverdopplungen sind als geteilt markiert")
{
    // C4 und E4 haben nur Teiltoene, die auch C3 bzw. E3 haben: sie lassen sich nicht einzeln bewerten
    const std::vector<int> cMajor { 48, 52, 55, 60, 64 };
    const auto events = chordsIn (strings (at (0.3, cMajor), 1.2), cMajor);
    REQUIRE (events.size() == 1);
    INFO (describe (events[0]));
    for (int i = 0; i < events[0].count; ++i)
    {
        const auto& t = events[0].tones[static_cast<size_t> (i)];
        CHECK (t.shared == (t.midi == 60 || t.midi == 64));
    }
}

TEST_CASE ("Akkord: geschlagener Akkord (Saiten nacheinander) zaehlt als ein Anschlag")
{
    const std::vector<int> eMajor { 40, 47, 52, 56, 59, 64 };
    const auto strum = GENERATE (0.008, 0.015);
    const auto events = chordsIn (strings (at (0.3, eMajor, strum), 1.2), eMajor);
    REQUIRE (events.size() == 1);
    INFO (describe (events[0]));
    for (const auto m : eMajor)
        CHECK (present (events[0], m));
}

TEST_CASE ("Akkord: nur nachklingende Saiten zaehlen nicht")
{
    // C-Dur angeschlagen, eine Sekunde spaeter nur C3 und G3 erneut: E3, C4, E4 klingen nur nach
    const std::vector<int> cMajor { 48, 52, 55, 60, 64 };
    auto strikes = at (0.3, cMajor);
    for (const auto& s : at (1.3, { 48, 55 }))
        strikes.push_back (s);

    const auto events = chordsIn (strings (strikes, 2.2), cMajor);
    REQUIRE (events.size() == 2);
    INFO (describe (events[1]));
    CHECK (present (events[1], 48));
    CHECK (present (events[1], 55));
    CHECK_FALSE (present (events[1], 52));
}

TEST_CASE ("Akkord: ohne mehrere erwartete Toene keine Akkordpruefung")
{
    const auto events = chordsIn (strings (at (0.3, { 48, 52, 55 }), 1.0), { 48 });
    CHECK (events.empty());
}
