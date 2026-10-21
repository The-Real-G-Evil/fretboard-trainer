// Gezielte Tests des NoteTrackers mit kuenstlichen Tonhoehen-Frames (Faelle aus echten Aufnahmen).

#include "audio/MusicMath.h"
#include "audio/NoteTracker.h"

#include <catch2/catch_test_macros.hpp>

#include <vector>

using namespace ft;

namespace
{
    constexpr double hop = 0.005;
    constexpr double frameLen = 0.043;

    struct Feeder
    {
        NoteTracker tracker;
        double t = 0.2;
        std::vector<NoteEvent> notes;

        Feeder() { tracker.reset(); }

        void onset() { tracker.onOnset (t); t += frameLen; }

        void frames (int count, double midi, float levelDb = -10.0f)
        {
            for (int i = 0; i < count; ++i, t += hop)
            {
                NoteTracker::Frame f;
                f.frameStartSec = t - frameLen;
                f.frameEndSec = t;
                f.hz = static_cast<float> (midiToHz (midi));
                f.voiced = true;
                f.levelDb = levelDb;
                if (auto ev = tracker.onFrame (f))
                    notes.push_back (*ev);
            }
        }
    };
}

TEST_CASE ("Kurzer Oktavsprung beim Ausklingen erzeugt keine Note")
{
    // Tiefe E-Saite des Basses: Erkennung springt kurz auf den ersten Oberton
    Feeder f;
    f.onset();
    f.frames (20, 28);
    f.frames (8, 40, -20.0f);
    f.frames (20, 28, -22.0f);

    REQUIRE (f.notes.size() == 1);
    CHECK (f.notes[0].midi == 28);
}

TEST_CASE ("Anhaltender Oktavsprung ohne Anschlag ist keine neue Note")
{
    // Grundton klingt schneller ab als der erste Oberton -> Erkennung kippt dauerhaft
    Feeder f;
    f.onset();
    f.frames (20, 28);
    f.frames (200, 40, -20.0f);

    REQUIRE (f.notes.size() == 1);
    CHECK (f.notes[0].midi == 28);
}

TEST_CASE ("Oktavsprung mit Anschlag ist eine neue Note")
{
    Feeder f;
    f.onset();
    f.frames (20, 45);
    f.onset();
    f.frames (20, 57);

    REQUIRE (f.notes.size() == 2);
    CHECK (f.notes[1].midi == 57);
    CHECK (f.notes[1].onsetType == OnsetType::pick);
}

TEST_CASE ("Tonhoehen-Verschiebung beim Loslassen ist keine Legato-Note")
{
    SECTION ("verstimmt (zwischen zwei Halbtoenen)")
    {
        Feeder f;
        f.onset();
        f.frames (40, 33);
        f.frames (10, 33.64); // A#1 -36 Cent
        REQUIRE (f.notes.size() == 1);
    }

    SECTION ("im leisen Ausklingen")
    {
        Feeder f;
        f.onset();
        f.frames (40, 33, -8.0f);
        f.frames (10, 34.0, -40.0f); // sauber intoniert, aber 32 dB leiser
        REQUIRE (f.notes.size() == 1);
    }
}

TEST_CASE ("Sauberer Hammer-on bleibt Legato")
{
    Feeder f;
    f.onset();
    f.frames (30, 45);
    f.frames (20, 47.1, -14.0f);

    REQUIRE (f.notes.size() == 2);
    CHECK (f.notes[1].midi == 47);
    CHECK (f.notes[1].onsetType == OnsetType::legato);
}

TEST_CASE ("Noten tragen Pegel und Anstieg gegenueber vorher")
{
    // Leere E-Saite klingt, dann ein leiser Pseudo-Anschlag (mitschwingende A-Saite), dann ein echter
    Feeder f;
    f.onset();
    f.frames (20, 28, -20.0f);
    f.onset();
    f.frames (10, 33, -45.0f);
    f.onset();
    f.frames (10, 47, -18.0f);

    REQUIRE (f.notes.size() == 3);
    CHECK (f.notes[0].levelDb == -20.0f);
    CHECK (f.notes[1].levelDb == -45.0f);
    CHECK (f.notes[1].riseDb == -25.0f); // leiser als das, was vorher klang
    CHECK (f.notes[2].levelDb == -18.0f);
    CHECK (f.notes[2].riseDb == 27.0f);
}
