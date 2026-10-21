// Hilfswerkzeug fuer die Erkennung:
//   ft_wavtool generate <ordner>                 synthetische Test-WAVs + Erwartungsdateien erzeugen
//   ft_wavtool analyze <datei.wav> [minHz maxHz]  Noten in einer Aufnahme erkennen und ausgeben
//   ft_wavtool onsets <datei.wav> <von> <bis>     Diagnose der Anschlagserkennung je Hop
//   Diagnose-Aufnahmen vom Ueben (WAV + JSON-Protokoll): python tools/diagnose.py <aufnahme.json>

#include "audio/Calibration.h"
#include "audio/ExpectedNotes.h"
#include "audio/Fft.h"
#include "audio/LevelMeter.h"
#include "audio/MusicMath.h"
#include "audio/WavFile.h"
#include "support/AnalysisHelpers.h"
#include "support/Synth.h"

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
            writeWav16 (dir / (p.name + ".wav"), audio, p.sampleRate);

            ExpectedNotes data;
            data.minHz = p.minHz;
            data.maxHz = p.maxHz;
            for (const auto& note : p.notes)
                data.notes.push_back ({ nearestNote (note.hz).midi, note.legato ? OnsetType::legato : OnsetType::pick, note.startSec });
            writeExpectedNotes (dir / (p.name + ".txt"), data);

            std::cout << "geschrieben: " << p.name << ".wav (" << p.notes.size() << " Noten)\n";
        }
        return 0;
    }

    /** Optimiert die Erkennungsparameter ueber alle <name>.wav/<name>.txt eines Ordners (wie die App). */
    int optimize (const std::filesystem::path& dir, float gateDb)
    {
        NoiseGate::Parameters gate;
        gate.thresholdDb = gateDb;

        std::vector<CalibrationTake> takes;
        std::vector<std::string> names;
        for (const auto& e : std::filesystem::directory_iterator (dir))
        {
            if (e.path().extension() != ".txt" || ! std::filesystem::exists (std::filesystem::path (e.path()).replace_extension (".wav")))
                continue;
            const auto wav = readWav (std::filesystem::path (e.path()).replace_extension (".wav"));
            takes.push_back (makeCalibrationTake (wav.samples, wav.sampleRate, readExpectedNotes (e.path()), gate));
            names.push_back (e.path().stem().string());
        }

        const auto r = optimiseTuning (takes, DetectionTuning {});
        auto print = [&] (const char* label, const TuningEvaluation& ev)
        {
            const auto& t = ev.tuning;
            std::cout << label << ": Fehler " << ev.totalCost << "  (Anstieg " << t.minRiseDb << " dB, Transient x"
                      << t.strongFluxFactor << ", Fluss x" << t.fluxMultiplier << ", stabil " << t.stableFrames
                      << ", Legato " << t.legatoFrames << ")\n";
            for (size_t i = 0; i < ev.scores.size(); ++i)
                std::cout << "    " << names[i] << "  " << static_cast<int> (ev.scores[i].accuracy * 100.0 + 0.5) << " %\n";
        };
        std::cout << r.combinationsTried << " Kombinationen, " << takes.size() << " Aufnahmen\n";
        print ("Standard", r.current);
        print ("Optimiert", r.best);
        return 0;
    }

    /** Bewertet eine Aufnahme wie die Kalibrierung der App (Reihenfolge, Ton, Anschlagsart). */
    int score (const std::string& wavPath, const std::string& txtPath, float gateDb, int legatoFrames)
    {
        const auto wav = readWav (wavPath);
        const auto expected = readExpectedNotes (txtPath);
        DetectionTuning tuning;
        tuning.legatoFrames = legatoFrames;

        // Ohne und mit erwarteter Tonfolge (wie der Cursor beim Ueben)
        OfflineOptions o;
        o.minHz = expected.minHz;
        o.maxHz = expected.maxHz;
        o.gate.thresholdDb = gateDb;
        o.tuning = tuning;
        for (const auto& n : expected.notes)
            o.expectedSequence.push_back (n.midi);
        const auto guided = analyseOffline (wav.samples, wav.sampleRate, o);
        int corrected = 0;
        std::vector<NoteEvent> guidedNotes;
        for (const auto& n : guided.notes)
        {
            guidedNotes.push_back (n.event);
            corrected += n.event.corrected ? 1 : 0;
        }
        const auto g = scoreTake (expected.notes, guidedNotes);
        std::cout << "mit Erwartung: " << std::fixed << std::setprecision (0) << g.accuracy * 100.0 << " % ("
                  << corrected << " Oktaven korrigiert) | ohne: ";

        const auto run = test::analyse (wav.samples, wav.sampleRate, expected.minHz, expected.maxHz, 128, gateDb, tuning);

        std::vector<NoteEvent> detected;
        for (const auto& n : run.notes)
            detected.push_back (n.event);

        const auto s = scoreTake (expected.notes, detected);
        std::cout << std::fixed << std::setprecision (0) << s.accuracy * 100.0 << " % (" << s.correct << "/" << s.expected
                  << " richtig, Art " << s.wrongType << ", Ton " << s.wrongPitch << ", fehlt " << s.missing
                  << ", extra " << s.extra << ")\n ";

        for (const auto& a : s.alignment)
        {
            const auto name = [] (int midi, OnsetType t) { return midiToName (midi) + (t == OnsetType::pick ? "p" : "l"); };
            const auto& d = a.detectedIndex >= 0 ? detected[static_cast<size_t> (a.detectedIndex)] : NoteEvent {};
            switch (a.kind)
            {
                case AlignKind::correct:    std::cout << " " << name (d.midi, d.onsetType); break;
                case AlignKind::wrongType:  std::cout << " [" << name (d.midi, d.onsetType) << " Art]"; break;
                case AlignKind::wrongPitch: std::cout << " [" << midiToName (expected.notes[static_cast<size_t> (a.expectedIndex)].midi)
                                                      << "->" << name (d.midi, d.onsetType) << "]"; break;
                case AlignKind::missing:    std::cout << " [-" << midiToName (expected.notes[static_cast<size_t> (a.expectedIndex)].midi) << "]"; break;
                case AlignKind::extra:      std::cout << " [+" << name (d.midi, d.onsetType) << " @"
                                                      << std::setprecision (2) << d.timeSec << std::setprecision (0) << "]"; break;
            }
        }
        std::cout << "\n";
        return 0;
    }

    int spectrum (const std::string& path, double fromSec, double toSec)
    {
        const auto wav = readWav (path);
        const auto from = std::min (wav.samples.size(), static_cast<size_t> (fromSec * wav.sampleRate));
        const auto to = std::min (wav.samples.size(), static_cast<size_t> (toSec * wav.sampleRate));
        const auto n = static_cast<size_t> (Fft::nextPowerOfTwo (static_cast<int> (to - from)));

        Fft fft;
        fft.prepare (static_cast<int> (n));
        std::vector<std::complex<float>> x (n);
        float peak = 0.0f;
        size_t clipped = 0;

        for (size_t i = from; i < to; ++i)
        {
            const auto w = 0.5 - 0.5 * std::cos (2.0 * 3.141592653589793 * static_cast<double> (i - from) / static_cast<double> (to - from));
            x[i - from] = { static_cast<float> (wav.samples[i] * w), 0.0f };
            peak = std::max (peak, std::abs (wav.samples[i]));
            clipped += std::abs (wav.samples[i]) > 0.99f ? 1 : 0;
        }

        fft.forward (x.data());
        std::vector<float> mag (n / 2);
        for (size_t k = 0; k < mag.size(); ++k)
            mag[k] = std::abs (x[k]);
        const auto maxMag = *std::max_element (mag.begin(), mag.end());

        std::cout << std::fixed << std::setprecision (1) << "Spitze " << gainToDb (peak) << " dBFS, uebersteuert: "
                  << clipped << " Samples\n  Frequenz [Hz]  Pegel [dB]  Note\n";

        std::vector<size_t> peaks;
        for (size_t k = 2; k + 2 < mag.size(); ++k)
            if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > 0.01f * maxMag
                && static_cast<double> (k) * wav.sampleRate / static_cast<double> (n) < 2000.0)
                peaks.push_back (k);

        std::sort (peaks.begin(), peaks.end(), [&] (auto a, auto b) { return mag[a] > mag[b]; });
        peaks.resize (std::min<size_t> (peaks.size(), 14));
        std::sort (peaks.begin(), peaks.end());

        for (auto k : peaks)
        {
            const auto hz = static_cast<double> (k) * wav.sampleRate / static_cast<double> (n);
            const auto nn = nearestNote (hz);
            std::cout << "  " << std::setw (12) << hz << "  " << std::setw (10) << gainToDb (mag[k] / maxMag) << "  "
                      << midiToName (nn.midi) << (nn.cents >= 0 ? "+" : "") << static_cast<int> (nn.cents) << "\n";
        }
        return 0;
    }

    int pitchFrames (const std::string& path, double fromSec, double toSec, float minHz, float maxHz)
    {
        const auto wav = readWav (path);
        PitchDetector det;
        PitchDetector::Config c;
        c.sampleRate = wav.sampleRate;
        c.minHz = minHz;
        c.maxHz = maxHz;
        det.prepare (c);

        const auto n = static_cast<size_t> (det.getFrameSize());
        const auto hop = static_cast<size_t> (wav.sampleRate * 0.01);
        std::cout << "  Ende [s]   Pegel     Hz     Note  Cent  Konf.  stimmhaft\n" << std::fixed;

        for (size_t end = n; end <= wav.samples.size(); end += hop)
        {
            const auto t = static_cast<double> (end) / wav.sampleRate;
            if (t < fromSec || t > toSec)
                continue;

            const auto* frame = wav.samples.data() + (end - n);
            float peak = 0.0f;
            for (size_t i = 0; i < n; ++i)
                peak = std::max (peak, std::abs (frame[i]));

            const auto r = det.detect (frame);
            const auto nn = nearestNote (r.hz > 0 ? r.hz : 1.0);
            std::cout << "  " << std::setprecision (3) << std::setw (7) << t << "  " << std::setprecision (1) << std::setw (6)
                      << gainToDb (peak) << "  " << std::setw (7) << r.hz << "  " << std::setw (4)
                      << (r.hz > 0 ? midiToName (nn.midi) : "-") << "  " << std::setw (5) << nn.cents << "  "
                      << std::setprecision (2) << r.confidence << "  " << (r.voiced ? "ja" : "nein") << "\n";
        }
        return 0;
    }

    int onsets (const std::string& path, double fromSec, double toSec)
    {
        const auto wav = readWav (path);
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

    int analyze (const std::string& path, float minHz, float maxHz, float gateDb)
    {
        const auto wav = readWav (path);
        const auto run = test::analyse (wav.samples, wav.sampleRate, minHz, maxHz, 128, gateDb);

        std::cout << path << ": " << wav.sampleRate << " Hz, " << std::fixed << std::setprecision (3)
                  << wav.samples.size() / wav.sampleRate << " s\n";
        std::cout << "  Zeit [s]  Note   Cent   Typ     Latenz [ms]  Pegel  Anstieg\n";

        for (const auto& n : run.notes)
        {
            std::cout << "  " << std::setw (8) << n.event.timeSec << "  " << std::setw (4) << midiToName (n.event.midi)
                      << "  " << std::setw (5) << std::setprecision (1) << n.event.cents << "   "
                      << (n.event.onsetType == OnsetType::pick ? "pick  " : "legato") << "  "
                      << std::setw (6) << (n.emittedAtSec - n.event.timeSec) * 1000.0 << "       "
                      << std::setw (6) << n.event.levelDb << "  " << std::setw (6) << n.event.riseDb
                      << std::setprecision (3) << "\n";
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

        if (cmd == "optimize" && (argc == 3 || argc == 4))
            return optimize (argv[2], argc == 4 ? std::stof (argv[3]) : -50.0f);

        if (cmd == "score" && argc >= 4 && argc <= 6)
            return score (argv[2], argv[3], argc >= 5 ? std::stof (argv[4]) : -50.0f,
                          argc == 6 ? std::stoi (argv[5]) : DetectionTuning {}.legatoFrames);

        if (cmd == "spectrum" && argc == 5)
            return spectrum (argv[2], std::stod (argv[3]), std::stod (argv[4]));

        if (cmd == "pitch" && (argc == 5 || argc == 7))
            return pitchFrames (argv[2], std::stod (argv[3]), std::stod (argv[4]),
                                argc == 7 ? std::stof (argv[5]) : 55.0f, argc == 7 ? std::stof (argv[6]) : 1500.0f);

        if (cmd == "onsets" && argc == 5)
            return onsets (argv[2], std::stod (argv[3]), std::stod (argv[4]));

        if (cmd == "analyze" && (argc == 3 || argc == 5 || argc == 6))
            return analyze (argv[2], argc >= 5 ? std::stof (argv[3]) : 55.0f, argc >= 5 ? std::stof (argv[4]) : 1500.0f,
                            argc == 6 ? std::stof (argv[5]) : -50.0f);
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
