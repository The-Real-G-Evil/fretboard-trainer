// Prueft alle WAV-Dateien in tests/data gegen ihre Erwartungsdatei (<name>.txt).
// Eigene Aufnahmen koennen einfach dazugelegt werden, siehe tests/data/README.md.

#include "audio/MusicMath.h"
#include "support/AnalysisHelpers.h"
#include "support/TestData.h"
#include "support/Wav.h"

#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <sstream>

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
            const auto wav = test::readWav (entry.path().string());
            const auto expected = test::readExpected (expectedPath.string());
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
                INFO ("Note " << i << ": erwartet " << midiToName (e.midi) << " @" << e.timeSec);
                CHECK (g.midi == e.midi);
                CHECK (g.onsetType == e.type);
                CHECK (std::abs (g.timeSec - e.timeSec)
                       <= (e.type == OnsetType::pick ? pickToleranceSec : legatoToleranceSec));
            }
        }

        ++checked;
    }

    CHECK (checked > 0);
}
