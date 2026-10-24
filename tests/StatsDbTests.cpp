#include "stats/StatsDb.h"

#include <sqlite3.h>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <filesystem>
#include <cmath>
#include <random>

using Catch::Matchers::WithinAbs;
using namespace ft;

namespace
{
    struct TempDb
    {
        std::filesystem::path file = std::filesystem::temp_directory_path()
                                   / ("ft_stats_test_" + std::to_string (std::random_device {}()) + ".sqlite");
        ~TempDb()
        {
            std::error_code ec;
            for (const auto* suffix : { "", "-wal", "-shm" })
                std::filesystem::remove (file.string() + suffix, ec);
        }
    };

    StatsDb::Attempt hit (int midi, double reactionMs)
    {
        StatsDb::Attempt a;
        a.expectedMidi = midi;
        a.playedMidi = midi;
        a.reactionMs = reactionMs;
        a.onsetType = "pick";
        a.correct = true;
        return a;
    }

    StatsDb::Attempt wrong (int expected, int played)
    {
        StatsDb::Attempt a;
        a.expectedMidi = expected;
        a.playedMidi = played;
        a.onsetType = "pick";
        a.correct = false;
        return a;
    }
}

TEST_CASE ("Statistik: Versuche ergeben Summen und Mittelwerte je Ton")
{
    TempDb tmp;
    StatsDb db (tmp.file);

    const auto s = db.startSession ({ "bass4", "veryEasy", "wait", "", 0.0 });
    db.addAttempt (s, hit (28, 1000));
    db.addAttempt (s, wrong (28, 40));
    db.addAttempt (s, hit (28, 2000));
    db.addAttempt (s, hit (33, 500));
    db.endSession (s, 300, 42.0);

    const auto stats = db.noteStats ("bass4");
    REQUIRE (stats.size() == 2);
    CHECK (stats[0].midi == 28);
    CHECK (stats[0].attempts == 3);
    CHECK (stats[0].hits == 2);
    CHECK_THAT (stats[0].avgReactionMs, WithinAbs (1500.0, 1e-9)); // nur Treffer
    CHECK (stats[1].midi == 33);
    CHECK (stats[1].hits == 1);
    CHECK_FALSE (stats[0].lastPracticed.empty());

    const auto sessions = db.sessions ("bass4", 10);
    REQUIRE (sessions.size() == 1);
    CHECK (sessions[0].hits == 3);
    CHECK (sessions[0].misses == 1);
    CHECK (sessions[0].score == 300);
    CHECK_THAT (sessions[0].durationSec, WithinAbs (42.0, 1e-9));
    CHECK_THAT (sessions[0].avgReactionMs, WithinAbs (3500.0 / 3.0, 1e-6));

    const auto conf = db.confusions ("bass4", 5);
    REQUIRE (conf.size() == 1);
    CHECK (conf[0].expectedMidi == 28);
    CHECK (conf[0].playedMidi == 40);
    CHECK (conf[0].count == 1);
}

TEST_CASE ("Statistik: getaktete Versuche, verpasste Noten und Griffpositionen")
{
    TempDb tmp;
    StatsDb db (tmp.file);
    const auto s = db.startSession ({ "guitar6", "medium", "timed", "medium", 90.0 });

    StatsDb::Attempt a;
    a.expectedMidi = 45;
    a.string = 1;
    a.fret = 0;
    a.playedMidi = 45;
    a.timingMs = -20.0;
    a.correct = true;
    db.addAttempt (s, a);
    a.timingMs = 40.0;
    db.addAttempt (s, a);

    StatsDb::Attempt missed;
    missed.expectedMidi = 45;
    missed.string = 1;
    missed.fret = 0;
    db.addAttempt (s, missed); // verpasst: kein gespielter Ton
    db.endSession (s, 200, 10.0);

    const auto stats = db.noteStats ("guitar6");
    REQUIRE (stats.size() == 1);
    CHECK (stats[0].string == 1);
    CHECK (stats[0].attempts == 3);
    CHECK (stats[0].hits == 2);
    CHECK_THAT (stats[0].avgTimingAbsMs, WithinAbs (30.0, 1e-9)); // Betrag gemittelt
    CHECK (db.confusions ("guitar6", 5).empty());                // verpasste Noten sind keine Verwechslung
    CHECK (db.noteStats ("bass4").empty());                       // je Instrument getrennt
}

TEST_CASE ("Statistik: leere Durchgaenge verschwinden, Daten ueberleben das Neuoeffnen")
{
    TempDb tmp;
    {
        StatsDb db (tmp.file);
        db.endSession (db.startSession ({ "bass4", "easy", "wait", "", 0.0 }), 0, 5.0);
        const auto s = db.startSession ({ "bass4", "easy", "wait", "", 0.0 });
        db.addAttempt (s, hit (40, 800));
        db.endSession (s, 100, 3.0);
        CHECK (db.sessions ("bass4", 10).size() == 1);
    }

    StatsDb again (tmp.file);
    CHECK (again.sessions ("bass4", 10).size() == 1);
    CHECK (again.noteStats ("bass4").size() == 1);

    again.clear ("bass4");
    CHECK (again.sessions ("bass4", 10).empty());
    CHECK (again.noteStats ("bass4").empty());
}

TEST_CASE ("Statistik: Lautstaerke-Bewertung je Durchgang und je Ton")
{
    TempDb tmp;
    StatsDb db (tmp.file);

    StatsDb::SessionInfo info { "bass4", "easy", "wait", "", 0.0 };
    info.dynamicsWindowDb = 4.0;
    const auto id = db.startSession (info);

    for (const double dev : { 1.0, -3.0, 6.0, -2.0 }) // drei im Fenster, einer zu laut
    {
        auto a = hit (40, 900.0);
        a.levelDb = -20.0 + dev;
        a.levelDevDb = dev;
        db.addAttempt (id, a);
    }
    db.addAttempt (id, hit (45, 900.0)); // ohne Bewertung (erste Treffer)
    db.endSession (id, 400, 30.0);

    const auto sessions = db.sessions ("bass4", 10);
    REQUIRE (sessions.size() == 1);
    REQUIRE (sessions[0].dynamicsWindowDb.has_value());
    CHECK (*sessions[0].dynamicsWindowDb == 4.0);
    CHECK (sessions[0].levelRated == 4);
    CHECK_THAT (sessions[0].levelInWindowRate, WithinAbs (0.75, 1e-9));
    CHECK_THAT (sessions[0].levelSpreadDb, WithinAbs (std::sqrt ((1.0 + 9.0 + 36.0 + 4.0) / 4.0), 1e-9));

    const auto levels = db.levelStats ("bass4");
    REQUIRE (levels.size() == 1);
    CHECK (levels[0].midi == 40);
    CHECK (levels[0].count == 4);
    CHECK_THAT (levels[0].avgDevDb, WithinAbs (0.5, 1e-9));
}

TEST_CASE ("Statistik: Datenbank der ersten Version wird um neue Spalten ergaenzt")
{
    TempDb tmp;
    {
        sqlite3* raw = nullptr;
        REQUIRE (sqlite3_open (tmp.file.string().c_str(), &raw) == SQLITE_OK);
        REQUIRE (sqlite3_exec (raw, R"sql(
            CREATE TABLE session (id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                instrument_id TEXT NOT NULL, difficulty TEXT NOT NULL, mode TEXT NOT NULL, tempo TEXT, bpm REAL,
                source TEXT NOT NULL DEFAULT 'random', gp_file TEXT, score INTEGER NOT NULL DEFAULT 0,
                duration_sec REAL NOT NULL DEFAULT 0);
            CREATE TABLE attempt (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
                at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), expected_midi INTEGER NOT NULL,
                string INTEGER NOT NULL DEFAULT -1, fret INTEGER NOT NULL DEFAULT -1, played_midi INTEGER, cents REAL,
                reaction_ms REAL, timing_ms REAL, onset_type TEXT, correct INTEGER NOT NULL,
                corrected_offline INTEGER NOT NULL DEFAULT 0);
            INSERT INTO session (instrument_id, difficulty, mode) VALUES ('bass4', 'easy', 'wait');
            INSERT INTO attempt (session_id, expected_midi, played_midi, correct) VALUES (1, 40, 40, 1);
        )sql", nullptr, nullptr, nullptr) == SQLITE_OK);
        sqlite3_close (raw);
    }

    StatsDb db (tmp.file);
    const auto sessions = db.sessions ("bass4", 10);
    REQUIRE (sessions.size() == 1); // alte Daten bleiben
    CHECK_FALSE (sessions[0].dynamicsWindowDb.has_value());
    CHECK (sessions[0].levelRated == 0);
    CHECK (db.levelStats ("bass4").empty());
}

TEST_CASE ("Statistik: Durchgaenge mit Lied merken Quelle und Liedname")
{
    TempDb tmp;
    StatsDb db (tmp.file);

    StatsDb::SessionInfo info { "bass4", "medium", "timed", "medium", 80.0 };
    info.source = "gp";
    info.gpFile = "Ünterwegs";
    const auto id = db.startSession (info);
    db.addAttempt (id, hit (40, 0.0));
    db.endSession (id, 100, 10.0);

    const auto random = db.startSession ({ "bass4", "easy", "wait", "", 0.0 });
    db.addAttempt (random, hit (41, 800.0));
    db.endSession (random, 100, 10.0);

    const auto sessions = db.sessions ("bass4", 10);
    REQUIRE (sessions.size() == 2);
    const auto& song = sessions[0].id == id ? sessions[0] : sessions[1];
    const auto& other = sessions[0].id == id ? sessions[1] : sessions[0];
    CHECK (song.source == "gp");
    CHECK (song.gpFile == "Ünterwegs");
    CHECK (other.source == "random");
    CHECK (other.gpFile.empty());
}

TEST_CASE ("Statistik: Versuche je Takt eines Lieds")
{
    TempDb tmp;
    StatsDb db (tmp.file);

    auto songSession = [&] (const char* file, int track)
    {
        StatsDb::SessionInfo info { "bass4", "easy", "wait", "", 0.0 };
        info.source = "gp";
        info.gpFile = file;
        info.gpTrack = track;
        return db.startSession (info);
    };
    auto atBar = [] (StatsDb::Attempt a, int bar) { a.bar = bar; return a; };

    const auto first = songSession ("Kryptonite", 2);
    db.addAttempt (first, atBar (hit (35, 900.0), 0));
    db.addAttempt (first, atBar (wrong (31, 33), 3));
    db.addAttempt (first, atBar (hit (31, 900.0), 3));
    db.endSession (first, 100, 10.0);

    const auto second = songSession ("Kryptonite", 2);
    db.addAttempt (second, atBar (wrong (31, 28), 3));
    db.endSession (second, 0, 5.0);

    const auto otherTrack = songSession ("Kryptonite", 0); // andere Spur zaehlt nicht mit
    db.addAttempt (otherTrack, atBar (hit (64, 900.0), 3));
    db.endSession (otherTrack, 100, 5.0);

    const auto bars = db.barStats ("bass4", "Kryptonite", 2);
    REQUIRE (bars.size() == 2);
    CHECK (bars[0].bar == 0);
    CHECK (bars[0].attempts == 1);
    CHECK (bars[0].hits == 1);
    CHECK (bars[1].bar == 3);
    CHECK (bars[1].attempts == 3);
    CHECK (bars[1].hits == 1);
    CHECK (db.barStats ("bass4", "Anderes Lied", 2).empty());
}

TEST_CASE ("Statistik: Endwert der Nachanalyse je Durchgang")
{
    TempDb tmp;
    StatsDb db (tmp.file);
    const auto id = db.startSession ({ "bass4", "easy", "wait", "", 0.0 });
    db.addAttempt (id, hit (40, 800));
    db.addAttempt (id, wrong (43, 44));
    db.endSession (id, 100, 3.0);

    CHECK_FALSE (db.sessions ("bass4", 10)[0].finalHits.has_value());
    CHECK (db.setFinalResult (id, 2, 3));
    const auto s = db.sessions ("bass4", 10)[0];
    CHECK (s.finalHits == 2);
    CHECK (s.finalTotal == 3);
    CHECK (db.sessionExists (id));
    CHECK_FALSE (db.setFinalResult (id + 100, 1, 1));
    CHECK_FALSE (db.sessionExists (id + 100));
}

TEST_CASE ("Statistik: Fortschritt je Kursuebung")
{
    TempDb tmp;
    StatsDb db (tmp.file);

    auto session = [&db] (const std::string& key, int hits, int misses, std::optional<std::pair<int, int>> final)
    {
        StatsDb::SessionInfo info { "bass4", "easy", "songPlay", "100%", 0.0 };
        info.source = "course";
        info.gpFile = key;
        const auto id = db.startSession (info);
        for (int i = 0; i < hits; ++i)
            db.addAttempt (id, hit (40, 500));
        for (int i = 0; i < misses; ++i)
            db.addAttempt (id, wrong (40, 41));
        db.endSession (id, 10, 5.0);
        if (final)
            db.setFinalResult (id, final->first, final->second);
    };
    session ("bass-fitness/001", 6, 4, std::nullopt);        // live 60 %
    session ("bass-fitness/001", 8, 2, std::pair { 9, 10 }); // Endwert 90 %
    session ("bass-fitness/002", 1, 1, std::nullopt);
    db.endSession (db.startSession ({ "bass4", "easy", "wait", "", 0.0 }), 0, 1.0); // kein Kurs

    const auto p = db.courseProgress();
    REQUIRE (p.size() == 2);
    CHECK (p[0].key == "bass-fitness/001");
    CHECK (p[0].sessions == 2);
    CHECK_THAT (p[0].bestRate, WithinAbs (0.9, 1e-9));
    CHECK (p[1].sessions == 1);
    CHECK_THAT (p[1].bestRate, WithinAbs (0.5, 1e-9));
}
