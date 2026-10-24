#pragma once

#include <filesystem>
#include <optional>
#include <string>
#include <vector>

struct sqlite3;

namespace ft
{

/** Uebungsstatistik in SQLite (SPEC Abschnitt 10).

    Tabellen:
      session    – ein Uebungsdurchgang (Instrument, Stufe, Modus, Tempo, Punkte, Dauer)
      attempt    – jeder gewertete Versuch (erwartet/gespielt, Cent, Reaktions-/Timingfehler, richtig,
                   Pegel und – mit Lautstaerke-Bewertung – Abweichung vom Bezug)
      note_stats – Summen je Instrument, Ton und Griffposition (laufend mitgefuehrt)

    Griffposition: string/fret nur, wenn sie beim Ueben angezeigt wurde (Stufe „Sehr leicht“),
    sonst -1 – dann ist unbekannt, wo gegriffen wurde.

    Nicht threadsicher; nur vom Message-Thread benutzen. Wirft std::runtime_error.
*/
class StatsDb
{
public:
    struct SessionInfo
    {
        std::string instrument, difficulty, mode, tempo;
        double bpm = 0.0;
        std::string source = "random"; ///< "random" | "gp" | "scale" | "course"
        std::string gpFile;            ///< Name des Lieds (nur source "gp")
        int gpTrack = -1;              ///< Spur im Lied
        std::optional<double> dynamicsWindowDb; ///< Fenster der Lautstaerke-Bewertung (leer: aus)
    };

    struct Attempt
    {
        int expectedMidi = 0;
        int string = -1, fret = -1;
        std::optional<int> playedMidi;   ///< leer: verpasst (getaktet)
        float cents = 0.0f;
        std::optional<double> reactionMs; ///< Warte-Modus
        std::optional<double> timingMs;   ///< getaktet: + zu spaet, - zu frueh
        std::string onsetType;            ///< "pick" | "legato" | ""
        bool correct = false;
        std::optional<double> levelDb;    ///< Pegel des gespielten Tons (dBFS)
        std::optional<double> levelDevDb; ///< Abweichung vom Bezugspegel (Lautstaerke-Bewertung)
        std::optional<int> bar;           ///< Takt im Lied (0-basiert)
    };

    struct NoteStat
    {
        int midi = 0, string = -1, fret = -1;
        int attempts = 0, hits = 0;
        double avgReactionMs = 0.0;  ///< nur Treffer im Warte-Modus
        double avgTimingAbsMs = 0.0; ///< nur Treffer im getakteten Modus
        std::string lastPracticed;   ///< ISO-Zeit
    };

    struct SessionSummary
    {
        long long id = 0;
        std::string startedAt, difficulty, mode, tempo;
        double bpm = 0.0, durationSec = 0.0;
        int score = 0, hits = 0, misses = 0;
        double avgReactionMs = 0.0, avgTimingAbsMs = 0.0;
        std::optional<double> dynamicsWindowDb;
        int levelRated = 0;              ///< Treffer mit Lautstaerke-Bewertung
        double levelInWindowRate = 0.0;  ///< Anteil davon im Fenster
        double levelSpreadDb = 0.0;      ///< quadratisch gemittelte Abweichung
        std::string source, gpFile;      ///< Notenquelle ("random" | "gp" | "scale") und Name
        std::optional<int> finalHits, finalTotal; ///< Endwert der Nachanalyse (leer: keine)
    };

    struct BarStat
    {
        int bar = 0, attempts = 0, hits = 0;
    };

    struct LevelStat
    {
        int midi = 0, count = 0;
        double avgDevDb = 0.0; ///< + = dieser Ton klingt meist lauter als der Bezug
    };

    /** Fortschritt einer Kursuebung (alle Instrumente). */
    struct CourseProgress
    {
        std::string key;             ///< "<Modul-Id>/<Uebungs-Id>"
        int sessions = 0;
        double bestRate = 0.0;       ///< beste Trefferquote (Endwert, sonst live) 0-1
        std::string lastPracticed;   ///< ISO-Zeit
    };

    struct Confusion
    {
        int expectedMidi = 0, playedMidi = 0, count = 0;
    };

    explicit StatsDb (const std::filesystem::path& file);
    ~StatsDb();

    StatsDb (const StatsDb&) = delete;
    StatsDb& operator= (const StatsDb&) = delete;

    long long startSession (const SessionInfo& info);
    void addAttempt (long long sessionId, const Attempt& a);
    /** Beendet den Durchgang; ohne Versuche wird er wieder entfernt. */
    void endSession (long long sessionId, int score, double durationSec);
    /** Endwert der Nachanalyse speichern. false: Durchgang gibt es nicht (mehr). */
    bool setFinalResult (long long sessionId, int hits, int total);
    /** Durchgaenge, die noch existieren (fuer das Aufraeumen der Aufnahmen). */
    bool sessionExists (long long sessionId);

    std::vector<NoteStat> noteStats (const std::string& instrument);
    std::vector<SessionSummary> sessions (const std::string& instrument, int limit);
    std::vector<Confusion> confusions (const std::string& instrument, int limit);
    std::vector<LevelStat> levelStats (const std::string& instrument);
    /** Versuche je Takt eines Lieds (alle Durchgaenge mit diesem Lied und dieser Spur). */
    std::vector<BarStat> barStats (const std::string& instrument, const std::string& gpFile, int gpTrack);
    /** Fortschritt aller Kursuebungen (Durchgaenge mit Quelle "course"). */
    std::vector<CourseProgress> courseProgress();

    /** Alle Daten eines Instruments loeschen. */
    void clear (const std::string& instrument);

private:
    void exec (const char* sql);
    void addColumnIfMissing (const char* table, const char* column, const char* type);

    sqlite3* db = nullptr;
};

} // namespace ft
