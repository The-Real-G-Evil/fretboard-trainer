// Tests der Kalibrier-Ablage (JUCE-abhaengig, daher eigenes Testprogramm).

#include "app/CalibrationStore.h"

#include <catch2/catch_test_macros.hpp>

using namespace ft;

namespace
{
    struct TempDir
    {
        juce::File dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                             .getChildFile ("ft_calib_test_" + juce::String (juce::Random::getSystemRandom().nextInt64()));
        TempDir()  { dir.createDirectory(); }
        ~TempDir() { dir.deleteRecursively(); }
    };

    juce::String entry (const juce::String& id, const juce::String& createdAt)
    {
        return R"({"id":")" + id + R"(","kind":"silence","exerciseId":"silence","createdAt":")" + createdAt + R"("})";
    }
}

TEST_CASE ("Alte gemeinsame Indexdatei wird in Einzeldateien uebernommen")
{
    TempDir tmp;
    const auto calib = tmp.dir.getChildFile ("calibration");
    calib.createDirectory();
    calib.getChildFile ("takes.json").replaceWithText ("[" + entry ("b", "2026-10-21T12:52:00") + ","
                                                           + entry ("a", "2026-10-21T12:51:00") + "]");

    {
        CalibrationStore store (tmp.dir);
        const auto* takes = store.getTakes().getArray();
        REQUIRE (takes != nullptr);
        REQUIRE (takes->size() == 2);
        CHECK (takes->getReference (0).getProperty ("id", {}).toString() == "a"); // nach Datum sortiert
        CHECK (takes->getReference (1).getProperty ("id", {}).toString() == "b");
    }

    CHECK_FALSE (calib.getChildFile ("takes.json").exists());
    CHECK (calib.getChildFile ("a.json").existsAsFile());
    CHECK (calib.getChildFile ("b.json").existsAsFile());

    // Zweiter Start liest die Einzeldateien
    CalibrationStore again (tmp.dir);
    CHECK (again.getTakes().getArray()->size() == 2);
}

TEST_CASE ("Ungueltige oder fremde JSON-Dateien werden ignoriert")
{
    TempDir tmp;
    const auto calib = tmp.dir.getChildFile ("calibration");
    calib.createDirectory();
    calib.getChildFile ("ok.json").replaceWithText (entry ("ok", "2026-10-21T12:00:00"));
    calib.getChildFile ("kaputt.json").replaceWithText ("{ nicht json");
    calib.getChildFile ("falscheid.json").replaceWithText (entry ("andere", "2026-10-21T12:00:00"));

    CalibrationStore store (tmp.dir);
    REQUIRE (store.getTakes().getArray()->size() == 1);
    CHECK (store.getTakes()[0].getProperty ("id", {}).toString() == "ok");
}

TEST_CASE ("Loeschen entfernt alle Dateien einer Aufnahme")
{
    TempDir tmp;
    const auto calib = tmp.dir.getChildFile ("calibration");
    calib.createDirectory();
    calib.getChildFile ("x.json").replaceWithText (entry ("x", "2026-10-21T12:00:00"));
    calib.getChildFile ("x.wav").replaceWithText ("RIFF");
    calib.getChildFile ("x.txt").replaceWithText ("40 pick");

    CalibrationStore store (tmp.dir);
    CHECK (store.removeTake ("x"));
    CHECK (store.getTakes().getArray()->isEmpty());
    CHECK_FALSE (calib.getChildFile ("x.json").exists());
    CHECK_FALSE (calib.getChildFile ("x.wav").exists());
    CHECK_FALSE (calib.getChildFile ("x.txt").exists());
}

TEST_CASE ("Fehlender Eintrag entsteht aus der Kopie in der Erwartungsdatei neu")
{
    TempDir tmp;
    const auto calib = tmp.dir.getChildFile ("calibration");
    calib.createDirectory();
    const juce::String json = R"({"id":"y","kind":"notes","instrument":"bass4","exerciseId":"open-strings","createdAt":"2026-10-27T18:51:26"})";
    calib.getChildFile ("y.wav").replaceWithText ("RIFF");
    calib.getChildFile ("y.txt").replaceWithText ("# Erwartete Noten\nrange 32 390\n28 pick\n# eintrag " + json + "\n");
    // ohne Kopie (aeltere Aufnahme) und mit fremder id: nichts wiederherstellen
    calib.getChildFile ("z.wav").replaceWithText ("RIFF");
    calib.getChildFile ("z.txt").replaceWithText ("range 32 390\n28 pick\n");
    calib.getChildFile ("w.wav").replaceWithText ("RIFF");
    calib.getChildFile ("w.txt").replaceWithText ("# eintrag " + json + "\n");

    CalibrationStore store (tmp.dir);
    REQUIRE (store.getTakes().getArray()->size() == 1);
    CHECK (store.getTakes()[0].getProperty ("exerciseId", {}).toString() == "open-strings");
    CHECK (calib.getChildFile ("y.json").existsAsFile());
    CHECK_FALSE (calib.getChildFile ("z.json").exists());
    CHECK_FALSE (calib.getChildFile ("w.json").exists());
}
