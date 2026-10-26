// Prueft alle WAV-Dateien in tests/data gegen ihre Erwartungsdatei (<name>.txt).
// Eigene Aufnahmen koennen einfach dazugelegt werden, siehe tests/data/README.md.

#include "audio/ExpectedNotes.h"
#include "audio/MusicMath.h"
#include "audio/WavFile.h"
#include "support/AnalysisHelpers.h"

#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

using namespace ft;
namespace fs = std::filesystem;

namespace
{
    constexpr double pickToleranceSec   = 0.020;
    constexpr double legatoToleranceSec = 0.060;
}

TEST_CASE ("Test-WAVs in tests/data")
{
    const fs::path dir (FT_TEST_DATA_DIR);
    REQUIRE (fs::is_directory (dir));

    int checked = 0;

    for (const auto& entry : fs::directory_iterator (dir))
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
            const auto run = test::analyse (wav.samples, wav.sampleRate, expected.minHz, expected.maxHz);

            std::ostringstream got;
            for (const auto& n : run.notes)
                got << midiToName (n.event.midi) << (n.event.onsetType == OnsetType::pick ? "/pick@" : "/legato@")
                    << n.event.timeSec << " ";
            INFO ("erkannt: " << got.str());

            REQUIRE (run.notes.size() == expected.notes.size());

            for (size_t i = 0; i < expected.notes.size(); ++i)
            {
                const auto& e = expected.notes[i];
                const auto& g = run.notes[i].event;
                INFO ("Note " << i << ": erwartet " << midiToName (e.midi) << " @" << e.timeSec.value_or (-1.0));
                CHECK (g.midi == e.midi);
                CHECK (g.onsetType == e.type);
                if (e.timeSec)
                    CHECK (std::abs (g.timeSec - *e.timeSec)
                           <= (e.type == OnsetType::pick ? pickToleranceSec : legatoToleranceSec));
            }
        }

        ++checked;
    }

    CHECK (checked > 0);
}

TEST_CASE ("WAV mit ungueltiger Bittiefe wird abgelehnt statt abzustuerzen")
{
    // fmt-Chunk mit 0 Bit pro Sample: frueher Division durch null
    const unsigned char wav[] = {
        'R','I','F','F', 40,0,0,0, 'W','A','V','E',
        'f','m','t',' ', 16,0,0,0,  1,0, 1,0,  0x80,0xbb,0,0,  0,0,0,0,  0,0, 0,0,
        'd','a','t','a',  4,0,0,0,  1,2,3,4 };
    const auto file = fs::temp_directory_path() / "ft_bits0.wav";
    {
        std::ofstream out (file, std::ios::binary);
        out.write (reinterpret_cast<const char*> (wav), sizeof (wav));
    }
    CHECK_THROWS_AS (readWav (file), std::runtime_error);
    fs::remove (file);
}
