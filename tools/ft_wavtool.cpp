// Hilfswerkzeug fuer die Erkennung:
//   ft_wavtool generate <ordner>                 synthetische Test-WAVs + Erwartungsdateien erzeugen
//   ft_wavtool analyze <datei.wav> [minHz maxHz]  Noten in einer Aufnahme erkennen und ausgeben
//   ft_wavtool onsets <datei.wav> <von> <bis>     Diagnose der Anschlagserkennung je Hop

#include "audio/MusicMath.h"
#include "support/AnalysisHelpers.h"
#include "support/Synth.h"
#include "support/TestData.h"
#include "support/Wav.h"

#include <filesystem>
#include <iomanip>
#include <iostream>
#include <string>

using namespace ft;

namespace
{
    struct Piece
    {
        std::string name;
        double sampleRate;
        double lengthSec;
        test::Voice voice;
        float minHz, maxHz;
        std::vector<test::SynthNote> notes;
    };

    std::vector<Piece> pieces()
    {
        test::Voice guitar;

        test::Voice bass;
        bass.fundamentalLevel = 0.25;
        bass.brightness = 0.8;
        bass.inharmonicity = 2e-4;
        bass.decayPerSec = 0.8;

        test::Voice dark = guitar;
        dark.brightness = 1.6;
        dark.attackNoise = 0.1;
        dark.noiseFloorDb = -66.0;

        auto n = [] (double t, int midi, bool legato = false, double db = 0.0)
        { return test::SynthNote { t, midiToHz (midi), legato, db }; };

        return {
            { "guitar_scale_44k", 44100.0, 3.4, guitar, 55.0f, 1500.0f,
              { n (0.2, 40), n (0.5, 42), n (0.8, 44), n (1.1, 45), n (1.4, 47), n (1.7, 49), n (2.0, 51), n (2.3, 52),
                n (2.6, 64), n (2.9, 76) } },
            { "guitar_jumps_48k", 48000.0, 3.4, guitar, 55.0f, 1500.0f,
              { n (0.2, 40), n (0.5, 45), n (0.8, 50), n (1.1, 55), n (1.4, 59), n (1.7, 64), n (2.0, 52), n (2.3, 76),
                n (2.6, 41), n (2.9, 88) } },
            { "guitar_legato_48k", 48000.0, 2.6, guitar, 55.0f, 1500.0f,
              { n (0.2, 57), n (0.5, 59, true), n (0.8, 60, true), n (1.2, 60), n (1.5, 59, true), n (1.8, 57, true),
                n (2.1, 57, false, -6.0) } },
            { "guitar_dark_noisy_48k", 48000.0, 1.8, dark, 55.0f, 1500.0f,
              { n (0.2, 43), n (0.6, 55), n (1.0, 67), n (1.4, 50) } },
            { "bass_lowB_48k", 48000.0, 2.8, bass, 28.0f, 800.0f,
              { n (0.2, 23), n (0.7, 28), n (1.2, 35), n (1.7, 40), n (2.2, 38, true) } },
        };
    }

    int generate (const std::filesystem::path& dir)
    {
        std::filesystem::create_directories (dir);

        for (const auto& p : pieces())
        {
            const auto audio = test::renderNotes (p.notes, p.lengthSec, p.sampleRate, p.voice, 42);
            test::writeWav16 ((dir / (p.name + ".wav")).string(), audio, p.sampleRate);

            test::TestCaseData data;
            data.minHz = p.minHz;
            data.maxHz = p.maxHz;
            for (const auto& note : p.notes)
                data.notes.push_back ({ nearestNote (note.hz).midi, note.legato ? OnsetType::legato : OnsetType::pick, note.startSec });
            test::writeExpected ((dir / (p.name + ".txt")).string(), data);

            std::cout << "geschrieben: " << p.name << ".wav (" << p.notes.size() << " Noten)\n";
        }
        return 0;
    }

    int onsets (const std::string& path, double fromSec, double toSec)
    {
        const auto wav = test::readWav (path);
        OnsetDetector det;
        OnsetDetector::Config c;
        c.sampleRate = wav.sampleRate;
        det.prepare (c);

        const auto hop = det.getHopSize();
        const auto win = det.getWindowSize();
        std::vector<float> window (static_cast<size_t> (win), 0.0f);

        std::cout << "  Ende [s]   Pegel  Anstieg   Fluss  Schwelle\n" << std::fixed;
        for (size_t pos = 0; pos + static_cast<size_t> (hop) <= wav.samples.size(); pos += static_cast<size_t> (hop))
        {
            std::copy (window.begin() + hop, window.end(), window.begin());
            std::copy (wav.samples.begin() + static_cast<std::ptrdiff_t> (pos),
                       wav.samples.begin() + static_cast<std::ptrdiff_t> (pos) + hop, window.end() - hop);

            const auto end = static_cast<long long> (pos) + hop;
            const auto onset = det.processHop (window.data(), end, true);
            const auto t = static_cast<double> (end) / wav.sampleRate;

            if (t < fromSec || t > toSec)
                continue;

            double e = 0.0;
            for (int i = win - hop; i < win; ++i)
                e += static_cast<double> (window[static_cast<size_t> (i)]) * window[static_cast<size_t> (i)];

            std::cout << "  " << std::setprecision (4) << t << "  " << std::setprecision (1) << std::setw (6)
                      << 10.0 * std::log10 (e / hop + 1e-12) << "  " << std::setw (7) << det.getLastRiseDb()
                      << "  " << std::setprecision (4) << std::setw (6) << det.getLastFlux() << "  " << std::setw (6)
                      << det.getLastFluxThreshold();
            if (onset)
                std::cout << "  <- Anschlag @" << static_cast<double> (*onset) / wav.sampleRate;
            std::cout << "\n";
        }
        return 0;
    }

    int analyze (const std::string& path, float minHz, float maxHz)
    {
        const auto wav = test::readWav (path);
        const auto run = test::analyse (wav.samples, wav.sampleRate, minHz, maxHz);

        std::cout << path << ": " << wav.sampleRate << " Hz, " << std::fixed << std::setprecision (3)
                  << wav.samples.size() / wav.sampleRate << " s\n";
        std::cout << "  Zeit [s]  Note   Cent   Typ     Latenz [ms]\n";

        for (const auto& n : run.notes)
        {
            std::cout << "  " << std::setw (8) << n.event.timeSec << "  " << std::setw (4) << midiToName (n.event.midi)
                      << "  " << std::setw (5) << std::setprecision (1) << n.event.cents << "   "
                      << (n.event.onsetType == OnsetType::pick ? "pick  " : "legato") << "  "
                      << std::setw (6) << (n.emittedAtSec - n.event.timeSec) * 1000.0 << std::setprecision (3) << "\n";
        }

        std::cout << "  " << run.onsets.size() << " Anschlaege erkannt\n";
        return 0;
    }
}

int main (int argc, char** argv)
{
    try
    {
        const std::string cmd = argc > 1 ? argv[1] : "";

        if (cmd == "generate" && argc == 3)
            return generate (argv[2]);

        if (cmd == "onsets" && argc == 5)
            return onsets (argv[2], std::stod (argv[3]), std::stod (argv[4]));

        if (cmd == "analyze" && (argc == 3 || argc == 5))
            return analyze (argv[2], argc == 5 ? std::stof (argv[3]) : 55.0f, argc == 5 ? std::stof (argv[4]) : 1500.0f);
    }
    catch (const std::exception& e)
    {
        std::cerr << "Fehler: " << e.what() << "\n";
        return 1;
    }

    std::cerr << "Aufruf:\n"
                 "  ft_wavtool generate <ordner>\n"
                 "  ft_wavtool analyze <datei.wav> [minHz maxHz]\n"
                 "  ft_wavtool onsets <datei.wav> <von_s> <bis_s>   Diagnose der Anschlagserkennung je Hop\n";
    return 2;
}
