// Liedwiedergabe im Audio-Thread: Zeitpunkte der Noten, Warte-Modus, Wiederholen, Vorzaehler, Mischpult.
// Nutzt den Soundfont aus dem alphaTab-Paket der Oberflaeche (fehlt er, werden die Tests uebersprungen).

#include "audio/SongPlayer.h"

#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <vector>

using namespace ft;

namespace
{
    constexpr double sr = 48000.0;
    constexpr int block = 256;

    std::vector<char> soundFont()
    {
        std::ifstream in (FT_TEST_SOUNDFONT, std::ios::binary);
        return { std::istreambuf_iterator<char> (in), std::istreambuf_iterator<char>() };
    }

    /** Bass (Programm 33) auf Kanal 0: Noten bei den angegebenen Ticks, je eine Achtel lang, 120 BPM. */
    std::unique_ptr<SongPlayer::Song> song (std::vector<long long> noteTicks, std::vector<long long> halts = {})
    {
        auto s = std::make_unique<SongPlayer::Song>();
        s->tempo = { { 0, 120.0 } };
        s->events.push_back ({ 0, 0xc0, 33, 0 });
        for (auto t : noteTicks)
        {
            s->events.push_back ({ t, 0x90, 40, 100 });
            s->events.push_back ({ t + 480, 0x80, 40, 0 });
        }
        std::sort (s->events.begin(), s->events.end(), [] (auto& a, auto& b) { return a.tick < b.tick; });
        s->haltTicks = std::move (halts);
        return s;
    }

    struct Rig
    {
        SongPlayer player;
        long long sample = 0;
        bool ok = false;

        Rig()
        {
            const auto sf = soundFont();
            player.prepare (sr, block);
            ok = ! sf.empty() && player.loadSoundFont (sf.data(), static_cast<int> (sf.size()));
        }

        /** Laeuft seconds lang; liefert das erste Sample (in s), dessen Betrag threshold uebersteigt (-1: keins). */
        double run (double seconds, float threshold = 0.01f)
        {
            std::vector<float> buf (block);
            double first = -1.0;
            const auto blocks = static_cast<int> (seconds * sr / block);
            for (int b = 0; b < blocks; ++b)
            {
                std::fill (buf.begin(), buf.end(), 0.0f);
                player.process (buf.data(), block, sample);
                for (int i = 0; i < block && first < 0.0; ++i)
                    if (std::abs (buf[static_cast<size_t> (i)]) > threshold)
                        first = static_cast<double> (sample + i) / sr;
                sample += block;
            }
            return first;
        }

        void start (std::unique_ptr<SongPlayer::Song> s, long long endTick, bool countIn = false)
        {
            player.setSong (std::move (s));
            run (0.01);
            player.setRange (0, endTick, false);
            player.play (countIn);
        }
    };
}

TEST_CASE ("Liedwiedergabe: Noten erklingen zur richtigen Zeit, auch langsamer")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden: " FT_TEST_SOUNDFONT);

    rig.start (song ({ 960 }), 3840); // Viertel 2 bei 120 BPM = 0,5 s
    const auto t0 = static_cast<double> (rig.sample) / sr;
    const auto first = rig.run (1.0);
    REQUIRE (first > 0.0);
    CHECK (std::abs ((first - t0) - 0.5) < 0.02);

    Rig slow;
    slow.start (song ({ 960 }), 3840);
    slow.player.setSpeed (0.5);
    const auto s0 = static_cast<double> (slow.sample) / sr;
    const auto firstSlow = slow.run (1.5);
    CHECK (std::abs ((firstSlow - s0) - 1.0) < 0.02);
}

TEST_CASE ("Liedwiedergabe: Warte-Modus haelt an der Note bis zur Freigabe")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden");

    rig.player.setWaitMode (true);
    rig.start (song ({ 960, 1920 }, { 960, 1920 }), 3840);
    CHECK (rig.run (1.0) < 0.0); // haelt vor der ersten Note: still
    auto st = rig.player.getStatus();
    CHECK (st.halted);
    CHECK (st.tick == 960.0);

    rig.player.setReleased (0, 1); // erste Note gespielt
    const auto t = static_cast<double> (rig.sample) / sr;
    const auto first = rig.run (0.3);
    REQUIRE (first > 0.0);
    CHECK (first - t < 0.02); // Begleitung setzt sofort ein
    rig.run (1.0);
    st = rig.player.getStatus();
    CHECK (st.halted);
    CHECK (st.tick == 1920.0);
    rig.player.setReleased (1, 2); // falscher Durchlauf: ignoriert
    rig.run (0.2);
    CHECK (rig.player.getStatus().tick == 1920.0);
}

TEST_CASE ("Liedwiedergabe: Wiederholen, Vorzaehler und stummer Kanal")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden");

    rig.player.setSong (song ({ 0 }));
    rig.run (0.01);
    rig.player.setRange (0, 1920, true); // eine halbe Note = 1 s je Durchlauf
    rig.player.play (true);
    rig.run (1.9); // Vorzaehler 4 Viertel = 2 s: Position steht
    auto st = rig.player.getStatus();
    CHECK (st.countIn);
    CHECK (st.tick == 0.0);
    rig.run (2.6);
    st = rig.player.getStatus();
    CHECK_FALSE (st.countIn);
    CHECK (st.pass == 2);
    CHECK (st.playing);

    Rig muted;
    if (muted.ok)
    {
        muted.player.setChannelGain (0, 0.0f);
        muted.start (song ({ 0, 960 }), 3840);
        CHECK (muted.run (1.0, 0.001f) < 0.0);
    }
}

TEST_CASE ("Liedwiedergabe: Soundfont waehrend der Wiedergabe austauschen")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden");

    rig.start (song ({ 0, 960, 1920, 2880 }), 3840);
    rig.run (0.2);
    const auto sf = soundFont();
    REQUIRE (rig.player.loadSoundFont (sf.data(), static_cast<int> (sf.size()))); // zweiter Soundfont
    rig.run (0.1);                                                            // Austausch im Audio-Thread
    const auto t = static_cast<double> (rig.sample) / sr;
    const auto first = rig.run (0.6);
    REQUIRE (first > 0.0);                     // naechste Note klingt mit dem neuen Soundfont
    CHECK (std::abs ((first - t) - 0.2) < 0.03); // Viertel 2 bei 0,5 s, jetzt ist es 0,3 s
    CHECK (rig.player.getStatus().playing);
    REQUIRE (rig.player.loadSoundFont (sf.data(), static_cast<int> (sf.size()))); // alter wird freigegeben
}

TEST_CASE ("Liedwiedergabe: Mischpult gilt auch, wenn das Lied Lautstaerke und Expression setzt")
{
    auto peak = [] (float gain)
    {
        Rig rig;
        if (! rig.ok)
            return -1.0f;
        auto s = song ({ 0 });
        // wie die MIDI-Daten von alphaTab: zu Beginn Kanal-Lautstaerke und Expression
        s->events.insert (s->events.begin(), { { 0, 0xb0, 7, 120 }, { 0, 0xb0, 11, 127 } });
        rig.player.setSong (std::move (s));
        rig.run (0.01);
        rig.player.setChannelGain (0, gain); // vor dem Start eingestellt
        rig.player.setRange (0, 3840, false);
        rig.player.play (false);
        std::vector<float> buf (block);
        float p = 0.0f;
        for (int b = 0; b < static_cast<int> (0.3 * sr / block); ++b)
        {
            std::fill (buf.begin(), buf.end(), 0.0f);
            rig.player.process (buf.data(), block, rig.sample);
            rig.sample += block;
            for (auto v : buf)
                p = std::max (p, std::abs (v));
        }
        return p;
    };

    const auto full = peak (1.0f);
    if (full < 0.0f)
        SKIP ("Soundfont nicht gefunden");
    const auto quiet = peak (0.1f);
    REQUIRE (full > 0.01f);
    CHECK (quiet < full * 0.2f);
    CHECK (quiet > 0.0f);
}

TEST_CASE ("Liedwiedergabe: Halte-Ticks im Lauf tauschen (Spurwechsel)")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden");

    rig.player.setWaitMode (true);
    rig.start (song ({ 0 }, { 960 }), 3840);
    rig.run (1.0);
    CHECK (rig.player.getStatus().halted);
    CHECK (rig.player.getStatus().tick == 960.0);

    rig.player.setHaltTicks ({ 1920, 2880 }); // andere Spur: naechste Note erst bei 1920
    rig.run (0.3);
    auto st = rig.player.getStatus();
    CHECK_FALSE (st.halted);   // laeuft ohne Halt weiter ...
    CHECK (st.tick > 960.0);
    rig.run (1.0);
    st = rig.player.getStatus();
    CHECK (st.halted);         // ... bis zur Note der neuen Spur
    CHECK (st.tick == 1920.0);
    rig.player.setHaltTicks ({ 2880 }); // alter Vektor wird hier freigegeben
    rig.run (0.1);
    CHECK_FALSE (rig.player.getStatus().halted);
}

TEST_CASE ("Liedwiedergabe: Wiederholen mit Anzahl der Durchlaeufe, Bereich im Lauf aendern")
{
    Rig rig;
    if (! rig.ok)
        SKIP ("Soundfont nicht gefunden");

    rig.player.setSong (song ({ 0 }));
    rig.run (0.01);
    rig.player.setRange (0, 960, true, 3); // ein Viertel = 0,5 s je Durchlauf, 3 Durchlaeufe
    rig.player.play (false);
    rig.run (1.2);
    auto st = rig.player.getStatus();
    CHECK (st.pass == 2);
    CHECK (st.playing);
    rig.run (0.5);
    st = rig.player.getStatus();
    CHECK (st.finished); // nach dem dritten Durchlauf Schluss
    CHECK_FALSE (st.playing);

    // Bereich waehrend der Wiedergabe hinter die aktuelle Stelle legen: springt an den neuen Anfang
    rig.player.setRange (0, 7680, false);
    rig.player.play (false);
    rig.run (0.3);
    rig.player.setRange (3840, 7680, false);
    rig.run (0.05);
    CHECK (rig.player.getStatus().tick >= 3840.0);
    CHECK (rig.player.getStatus().tick < 3840.0 + 300.0);
}
