#include "audio/ExpectedNotes.h"
#include "audio/MusicMath.h"
#include "audio/NoteAlignment.h"
#include "audio/WavFile.h"
#include "support/AnalysisHelpers.h"
#include "support/Synth.h"

#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>

#include <filesystem>
#include <sstream>

using namespace ft;
namespace fs = std::filesystem;

namespace
{
    constexpr double sr = 48000.0;

    std::vector<NoteSegment> segmentsOf (const std::vector<float>& signal, double rate, float minHz = 55.0f, float maxHz = 1500.0f)
    {
        const auto run = test::analyse (signal, rate, minHz, maxHz);
        SegmentationConfig c;
        c.sampleRate = rate;
        c.frameSize = run.frameSize;
        c.minMidi = static_cast<int> (std::floor (hzToMidi (minHz))) - 1;
        c.maxMidi = static_cast<int> (std::ceil (hzToMidi (maxHz))) + 1;
        return segmentNotes (run.pitches, run.onsets, c);
    }

    std::string describe (const std::vector<NoteSegment>& segs)
    {
        std::ostringstream s;
        for (const auto& n : segs)
            s << midiToName (n.midi) << (n.pick ? "" : "~") << "@" << n.startSec << " ";
        return s.str();
    }

    NoteSegment seg (double start, int midi, double len = 0.2)
    {
        return { start, start + len, midi, 0.0f, true };
    }
}

TEST_CASE ("Nachanalyse: Test-WAVs ergeben die erwarteten Noten")
{
    for (const auto& entry : fs::directory_iterator (fs::path (FT_TEST_DATA_DIR)))
    {
        if (entry.path().extension() != ".wav")
            continue;
        const auto expectedPath = fs::path (entry.path()).replace_extension (".txt");
        if (! fs::exists (expectedPath))
            continue;

        DYNAMIC_SECTION (entry.path().filename().string())
        {
            const auto wav = readWav (entry.path().string());
            const auto expected = readExpectedNotes (expectedPath.string());
            const auto segs = segmentsOf (wav.samples, wav.sampleRate, expected.minHz, expected.maxHz);
            INFO ("erkannt: " << describe (segs));
            REQUIRE (segs.size() == expected.notes.size());
            for (size_t i = 0; i < segs.size(); ++i)
            {
                INFO ("Note " << i);
                CHECK (segs[i].midi == expected.notes[i].midi);
                CHECK (segs[i].pick == (expected.notes[i].type == OnsetType::pick));
                if (expected.notes[i].timeSec && expected.notes[i].type == OnsetType::pick)
                    CHECK (std::abs (segs[i].startSec - *expected.notes[i].timeSec) < 0.02);
            }
        }
    }
}

TEST_CASE ("Nachanalyse: schnelle Passage wird vollstaendig erkannt")
{
    // Sechzehntel bei 160 BPM (94 ms je Note), Gitarrenlage, darunter Tonwiederholungen
    const std::vector<int> melody { 52, 55, 57, 59, 57, 55, 52, 52, 50, 52, 55, 57, 60, 59, 57, 55 };
    const auto step = 60.0 / 160.0 / 4.0;
    std::vector<test::SynthNote> notes;
    for (size_t i = 0; i < melody.size(); ++i)
        notes.push_back ({ 0.3 + static_cast<double> (i) * step, midiToHz (melody[i]) });
    const auto signal = test::renderNotes (notes, 0.3 + static_cast<double> (melody.size()) * step + 0.5, sr);

    const auto segs = segmentsOf (signal, sr);
    INFO ("erkannt: " << describe (segs));
    REQUIRE (segs.size() == melody.size());
    for (size_t i = 0; i < segs.size(); ++i)
    {
        INFO ("Note " << i);
        CHECK (segs[i].midi == melody[i]);
        CHECK (std::abs (segs[i].startSec - notes[i].startSec) < 0.015);
    }
}

TEST_CASE ("Ausrichtung an der erwarteten Notenfolge")
{
    SECTION ("Warte-Modus: falscher Ton dazwischen, verpasster Ton am Ende")
    {
        const std::vector<ExpectedItem> expected { { { 40 } }, { { 43 } }, { { 45 } }, { { 47 } } };
        const auto a = alignNotes (expected, { seg (0.1, 40), seg (0.5, 44), seg (0.9, 43), seg (1.3, 45) }, {});
        CHECK (a.hits == 3);
        CHECK (a.items[0].segment == 0);
        CHECK (a.items[1].segment == 2);
        CHECK (a.items[3].verdict == AlignVerdict::missed);
        REQUIRE (a.extra.size() == 1);
        CHECK (a.extra[0] == 1);
    }

    SECTION ("Oktave und falscher Ton an einer Stelle")
    {
        const std::vector<ExpectedItem> expected { { { 40 } }, { { 43 } }, { { 45 } } };
        const auto a = alignNotes (expected, { seg (0.1, 52), seg (0.5, 43), seg (0.9, 46) }, {});
        CHECK (a.items[0].verdict == AlignVerdict::octave);
        CHECK (a.items[1].verdict == AlignVerdict::hit);
        CHECK (a.items[2].verdict == AlignVerdict::wrong);
        CHECK (a.extra.empty());
    }

    SECTION ("Getaktet: Zeit zaehlt, Akkordton genuegt")
    {
        const std::vector<ExpectedItem> expected { { { 40 }, 1.0 }, { { 43 }, 1.5 }, { { 45, 52 }, 2.0 }, { { 47 }, 2.5 } };
        AlignConfig c;
        c.toleranceSec = 0.1;
        const auto a = alignNotes (expected, { seg (1.02, 40), seg (1.38, 43), seg (2.01, 52), seg (2.7, 47) }, c);
        CHECK (a.items[0].verdict == AlignVerdict::hit);
        CHECK (a.items[1].verdict == AlignVerdict::early);
        CHECK (std::abs (a.items[1].timingErrorMs + 120.0) < 1e-6);
        CHECK (a.items[2].verdict == AlignVerdict::hit);
        CHECK (a.items[3].verdict == AlignVerdict::late);
        CHECK (a.hits == 2);
    }

    SECTION ("Getaktet: ein ausgelassener Ton verschiebt die Zuordnung nicht")
    {
        const std::vector<ExpectedItem> expected { { { 40 }, 1.0 }, { { 40 }, 1.5 }, { { 40 }, 2.0 } };
        AlignConfig c;
        c.toleranceSec = 0.1;
        const auto a = alignNotes (expected, { seg (1.0, 40), seg (2.0, 40) }, c);
        CHECK (a.items[0].segment == 0);
        CHECK (a.items[1].verdict == AlignVerdict::missed);
        CHECK (a.items[2].segment == 1);
    }
}
