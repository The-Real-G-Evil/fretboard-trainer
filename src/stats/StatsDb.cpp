#include "stats/StatsDb.h"

#include <sqlite3.h>

#include <cmath>
#include <stdexcept>

namespace ft
{

namespace
{
    /** Vorbereitete Anweisung mit automatischem Aufraeumen. */
    class Statement
    {
    public:
        Statement (sqlite3* db, const char* sql)
        {
            if (sqlite3_prepare_v2 (db, sql, -1, &stmt, nullptr) != SQLITE_OK)
                throw std::runtime_error (std::string ("SQL-Fehler: ") + sqlite3_errmsg (db));
        }
        ~Statement() { sqlite3_finalize (stmt); }

        Statement& bind (int i, int v)                  { sqlite3_bind_int (stmt, i, v); return *this; }
        Statement& bind (int i, long long v)            { sqlite3_bind_int64 (stmt, i, v); return *this; }
        Statement& bind (int i, double v)               { sqlite3_bind_double (stmt, i, v); return *this; }
        Statement& bind (int i, const std::string& v)   { sqlite3_bind_text (stmt, i, v.c_str(), -1, SQLITE_TRANSIENT); return *this; }
        Statement& bindNull (int i)                     { sqlite3_bind_null (stmt, i); return *this; }

        template <typename T>
        Statement& bind (int i, const std::optional<T>& v) { return v ? bind (i, *v) : bindNull (i); }

        bool step()
        {
            const auto rc = sqlite3_step (stmt);
            if (rc == SQLITE_ROW)
                return true;
            if (rc != SQLITE_DONE)
                throw std::runtime_error (std::string ("SQL-Fehler: ") + sqlite3_errmsg (sqlite3_db_handle (stmt)));
            return false;
        }

        int         integer (int col) const { return sqlite3_column_int (stmt, col); }
        long long   int64 (int col) const   { return sqlite3_column_int64 (stmt, col); }
        double      real (int col) const    { return sqlite3_column_double (stmt, col); }
        bool        isNull (int col) const  { return sqlite3_column_type (stmt, col) == SQLITE_NULL; }
        std::string text (int col) const
        {
            const auto* t = sqlite3_column_text (stmt, col);
            return t != nullptr ? reinterpret_cast<const char*> (t) : std::string();
        }

    private:
        sqlite3_stmt* stmt = nullptr;
    };

    constexpr const char* schema = R"sql(
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS session (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            instrument_id TEXT    NOT NULL,
            difficulty    TEXT    NOT NULL,
            mode          TEXT    NOT NULL,
            tempo         TEXT,
            bpm           REAL,
            source        TEXT    NOT NULL DEFAULT 'random',
            gp_file       TEXT,
            score         INTEGER NOT NULL DEFAULT 0,
            duration_sec  REAL    NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS attempt (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id        INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
            at                TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expected_midi     INTEGER NOT NULL,
            string            INTEGER NOT NULL DEFAULT -1,
            fret              INTEGER NOT NULL DEFAULT -1,
            played_midi       INTEGER,
            cents             REAL,
            reaction_ms       REAL,
            timing_ms         REAL,
            onset_type        TEXT,
            correct           INTEGER NOT NULL,
            corrected_offline INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS attempt_session ON attempt(session_id);

        CREATE TABLE IF NOT EXISTS note_stats (
            instrument_id      TEXT    NOT NULL,
            midi               INTEGER NOT NULL,
            string             INTEGER NOT NULL,
            fret               INTEGER NOT NULL,
            attempts           INTEGER NOT NULL DEFAULT 0,
            hits               INTEGER NOT NULL DEFAULT 0,
            reaction_hits      INTEGER NOT NULL DEFAULT 0,
            avg_reaction_ms    REAL    NOT NULL DEFAULT 0,
            timing_hits        INTEGER NOT NULL DEFAULT 0,
            avg_timing_ms      REAL    NOT NULL DEFAULT 0,
            last_practiced     TEXT,
            PRIMARY KEY (instrument_id, midi, string, fret)
        );
    )sql";
}

StatsDb::StatsDb (const std::filesystem::path& file)
{
    if (sqlite3_open (file.string().c_str(), &db) != SQLITE_OK)
    {
        const std::string message = db != nullptr ? sqlite3_errmsg (db) : "unbekannt";
        sqlite3_close (db);
        db = nullptr;
        throw std::runtime_error ("Statistik-Datenbank nicht zu oeffnen: " + message);
    }

    exec (schema);

    // Spalten, die nach der ersten Version dazugekommen sind
    addColumnIfMissing ("session", "dynamics_window_db", "REAL");
    addColumnIfMissing ("attempt", "level_db", "REAL");
    addColumnIfMissing ("attempt", "level_dev_db", "REAL");
    addColumnIfMissing ("attempt", "bar", "INTEGER");
    addColumnIfMissing ("session", "gp_track", "INTEGER");
    addColumnIfMissing ("session", "final_hits", "INTEGER");
    addColumnIfMissing ("session", "final_total", "INTEGER");
}

void StatsDb::addColumnIfMissing (const char* table, const char* column, const char* type)
{
    Statement info (db, (std::string ("PRAGMA table_info(") + table + ")").c_str());
    while (info.step())
        if (info.text (1) == column)
            return;
    exec ((std::string ("ALTER TABLE ") + table + " ADD COLUMN " + column + " " + type).c_str());
}

StatsDb::~StatsDb()
{
    sqlite3_close (db);
}

void StatsDb::exec (const char* sql)
{
    char* error = nullptr;
    if (sqlite3_exec (db, sql, nullptr, nullptr, &error) != SQLITE_OK)
    {
        const std::string message = error != nullptr ? error : "unbekannt";
        sqlite3_free (error);
        throw std::runtime_error ("SQL-Fehler: " + message);
    }
}

long long StatsDb::startSession (const SessionInfo& info)
{
    Statement s (db, "INSERT INTO session (instrument_id, difficulty, mode, tempo, bpm, source, dynamics_window_db, gp_file,"
                     " gp_track) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    s.bind (1, info.instrument).bind (2, info.difficulty).bind (3, info.mode).bind (4, info.tempo)
     .bind (5, info.bpm).bind (6, info.source).bind (7, info.dynamicsWindowDb);
    if (info.gpFile.empty())
        s.bindNull (8).bindNull (9);
    else
        s.bind (8, info.gpFile).bind (9, info.gpTrack);
    s.step();
    return sqlite3_last_insert_rowid (db);
}

bool StatsDb::setFinalResult (long long sessionId, int hits, int total)
{
    Statement s (db, "UPDATE session SET final_hits = ?, final_total = ? WHERE id = ?");
    s.bind (1, hits).bind (2, total).bind (3, sessionId);
    s.step();
    return sqlite3_changes (db) > 0;
}

bool StatsDb::sessionExists (long long sessionId)
{
    Statement s (db, "SELECT 1 FROM session WHERE id = ?");
    s.bind (1, sessionId);
    return s.step();
}

void StatsDb::addAttempt (long long sessionId, const Attempt& a)
{
    exec ("BEGIN");
    try
    {
        Statement ins (db, "INSERT INTO attempt (session_id, expected_midi, string, fret, played_midi, cents, reaction_ms,"
                           " timing_ms, onset_type, correct, level_db, level_dev_db, bar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        ins.bind (1, sessionId).bind (2, a.expectedMidi).bind (3, a.string).bind (4, a.fret).bind (5, a.playedMidi)
           .bind (6, static_cast<double> (a.cents)).bind (7, a.reactionMs).bind (8, a.timingMs).bind (9, a.onsetType)
           .bind (10, a.correct ? 1 : 0).bind (11, a.levelDb).bind (12, a.levelDevDb).bind (13, a.bar).step();

        // Laufende Mittelwerte nur ueber Treffer
        const bool withReaction = a.correct && a.reactionMs.has_value();
        const bool withTiming = a.correct && a.timingMs.has_value();

        Statement up (db, R"sql(
            INSERT INTO note_stats (instrument_id, midi, string, fret, attempts, hits, reaction_hits, avg_reaction_ms,
                                    timing_hits, avg_timing_ms, last_practiced)
            SELECT instrument_id, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              FROM session WHERE id = ?1
            ON CONFLICT (instrument_id, midi, string, fret) DO UPDATE SET
                attempts        = attempts + 1,
                hits            = hits + excluded.hits,
                avg_reaction_ms = CASE WHEN excluded.reaction_hits = 1
                                       THEN (avg_reaction_ms * reaction_hits + excluded.avg_reaction_ms) / (reaction_hits + 1)
                                       ELSE avg_reaction_ms END,
                reaction_hits   = reaction_hits + excluded.reaction_hits,
                avg_timing_ms   = CASE WHEN excluded.timing_hits = 1
                                       THEN (avg_timing_ms * timing_hits + excluded.avg_timing_ms) / (timing_hits + 1)
                                       ELSE avg_timing_ms END,
                timing_hits     = timing_hits + excluded.timing_hits,
                last_practiced  = excluded.last_practiced
        )sql");
        up.bind (1, sessionId).bind (2, a.expectedMidi).bind (3, a.string).bind (4, a.fret)
          .bind (5, a.correct ? 1 : 0)
          .bind (6, withReaction ? 1 : 0).bind (7, withReaction ? *a.reactionMs : 0.0)
          .bind (8, withTiming ? 1 : 0).bind (9, withTiming ? std::abs (*a.timingMs) : 0.0)
          .step();

        exec ("COMMIT");
    }
    catch (...)
    {
        exec ("ROLLBACK");
        throw;
    }
}

void StatsDb::endSession (long long sessionId, int score, double durationSec)
{
    Statement count (db, "SELECT COUNT(*) FROM attempt WHERE session_id = ?");
    count.bind (1, sessionId);
    const auto attempts = count.step() ? count.integer (0) : 0;

    if (attempts == 0)
    {
        Statement del (db, "DELETE FROM session WHERE id = ?");
        del.bind (1, sessionId).step();
        return;
    }

    Statement up (db, "UPDATE session SET score = ?, duration_sec = ? WHERE id = ?");
    up.bind (1, score).bind (2, durationSec).bind (3, sessionId).step();
}

std::vector<StatsDb::NoteStat> StatsDb::noteStats (const std::string& instrument)
{
    Statement s (db, "SELECT midi, string, fret, attempts, hits, avg_reaction_ms, avg_timing_ms, COALESCE(last_practiced, '')"
                     " FROM note_stats WHERE instrument_id = ? ORDER BY midi, string, fret");
    s.bind (1, instrument);

    std::vector<NoteStat> out;
    while (s.step())
        out.push_back ({ s.integer (0), s.integer (1), s.integer (2), s.integer (3), s.integer (4), s.real (5), s.real (6), s.text (7) });
    return out;
}

std::vector<StatsDb::SessionSummary> StatsDb::sessions (const std::string& instrument, int limit)
{
    Statement s (db, R"sql(
        SELECT s.id, s.started_at, s.difficulty, s.mode, COALESCE(s.tempo, ''), COALESCE(s.bpm, 0), s.duration_sec, s.score,
               SUM(a.correct), SUM(1 - a.correct),
               COALESCE(AVG(CASE WHEN a.correct = 1 THEN a.reaction_ms END), 0),
               COALESCE(AVG(CASE WHEN a.correct = 1 THEN ABS(a.timing_ms) END), 0),
               s.dynamics_window_db, COUNT(a.level_dev_db),
               COALESCE(AVG(CASE WHEN a.level_dev_db IS NOT NULL
                                 THEN (ABS(a.level_dev_db) <= s.dynamics_window_db) END), 0),
               COALESCE(AVG(a.level_dev_db * a.level_dev_db), 0),
               s.source, COALESCE(s.gp_file, ''), s.final_hits, s.final_total
          FROM session s JOIN attempt a ON a.session_id = s.id
         WHERE s.instrument_id = ?
         GROUP BY s.id ORDER BY s.started_at DESC LIMIT ?
    )sql");
    s.bind (1, instrument).bind (2, limit);

    std::vector<SessionSummary> out;
    while (s.step())
    {
        SessionSummary r { s.int64 (0), s.text (1), s.text (2), s.text (3), s.text (4), s.real (5), s.real (6),
                           s.integer (7), s.integer (8), s.integer (9), s.real (10), s.real (11) };
        if (! s.isNull (12))
            r.dynamicsWindowDb = s.real (12);
        r.levelRated = s.integer (13);
        r.levelInWindowRate = s.real (14);
        r.levelSpreadDb = std::sqrt (s.real (15)); // SQLite ohne Mathe-Funktionen
        r.source = s.text (16);
        r.gpFile = s.text (17);
        if (! s.isNull (18) && ! s.isNull (19))
        {
            r.finalHits = s.integer (18);
            r.finalTotal = s.integer (19);
        }
        out.push_back (r);
    }
    return out;
}

std::vector<StatsDb::CourseProgress> StatsDb::courseProgress()
{
    Statement s (db, R"sql(
        SELECT key, COUNT(*), MAX(rate), MAX(started_at) FROM (
            SELECT s.gp_file AS key, s.started_at,
                   CASE WHEN s.final_total > 0 THEN 1.0 * s.final_hits / s.final_total
                        ELSE 1.0 * SUM(a.correct) / COUNT(a.id) END AS rate
              FROM session s JOIN attempt a ON a.session_id = s.id
             WHERE s.source = 'course' AND s.gp_file IS NOT NULL
             GROUP BY s.id)
         GROUP BY key ORDER BY key
    )sql");

    std::vector<CourseProgress> out;
    while (s.step())
        out.push_back ({ s.text (0), s.integer (1), s.real (2), s.text (3) });
    return out;
}

std::vector<StatsDb::Confusion> StatsDb::confusions (const std::string& instrument, int limit)
{
    Statement s (db, R"sql(
        SELECT a.expected_midi, a.played_midi, COUNT(*) AS n
          FROM attempt a JOIN session s ON s.id = a.session_id
         WHERE s.instrument_id = ? AND a.correct = 0 AND a.played_midi IS NOT NULL
         GROUP BY a.expected_midi, a.played_midi ORDER BY n DESC LIMIT ?
    )sql");
    s.bind (1, instrument).bind (2, limit);

    std::vector<Confusion> out;
    while (s.step())
        out.push_back ({ s.integer (0), s.integer (1), s.integer (2) });
    return out;
}

std::vector<StatsDb::LevelStat> StatsDb::levelStats (const std::string& instrument)
{
    Statement s (db, R"sql(
        SELECT a.expected_midi, COUNT(*), AVG(a.level_dev_db)
          FROM attempt a JOIN session s ON s.id = a.session_id
         WHERE s.instrument_id = ? AND a.correct = 1 AND a.level_dev_db IS NOT NULL
         GROUP BY a.expected_midi ORDER BY a.expected_midi
    )sql");
    s.bind (1, instrument);

    std::vector<LevelStat> out;
    while (s.step())
        out.push_back ({ s.integer (0), s.integer (1), s.real (2) });
    return out;
}

std::vector<StatsDb::BarStat> StatsDb::barStats (const std::string& instrument, const std::string& gpFile, int gpTrack)
{
    Statement s (db, R"sql(
        SELECT a.bar, COUNT(*), SUM(a.correct)
          FROM attempt a JOIN session s ON s.id = a.session_id
         WHERE s.instrument_id = ? AND s.source = 'gp' AND s.gp_file = ? AND s.gp_track = ? AND a.bar IS NOT NULL
         GROUP BY a.bar ORDER BY a.bar
    )sql");
    s.bind (1, instrument).bind (2, gpFile).bind (3, gpTrack);

    std::vector<BarStat> out;
    while (s.step())
        out.push_back ({ s.integer (0), s.integer (1), s.integer (2) });
    return out;
}

void StatsDb::clear (const std::string& instrument)
{
    Statement a (db, "DELETE FROM session WHERE instrument_id = ?");
    a.bind (1, instrument).step();
    Statement b (db, "DELETE FROM note_stats WHERE instrument_id = ?");
    b.bind (1, instrument).step();
}

} // namespace ft
