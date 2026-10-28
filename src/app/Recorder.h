#pragma once

#include "audio/AudioEngine.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <functional>
#include <memory>

namespace ft
{

/** Aufnahme in Audiodateien. Waehrend der Aufnahme schreibt ein eigener Thread den Abgriff der
    AudioEngine verlustfrei in temporaere Float-WAVs (trocken: mono, mit Effekten: stereo); beim
    Beenden werden daraus die gewaehlten Formate erzeugt und die temporaeren Dateien geloescht.

    Verlorene Bloecke (FIFO voll) werden durch Stille ersetzt, damit die Zeitachse stimmt.
    Ein Geraetewechsel beendet die Aufnahme. */
class Recorder : private juce::Thread
{
public:
    enum class Format { wav, flac, ogg, mp3 };

    struct Options
    {
        juce::File folder;
        juce::String baseName;         ///< ohne Endung
        bool dry = true, wet = false;  ///< mindestens eins
        juce::Array<Format> formats;   ///< mindestens eins
        int lossyKbps = 256;           ///< Ogg und MP3
        juce::String dryLabel, wetLabel; ///< Namenszusatz, wenn beide Signale aufgenommen werden
    };

    struct Result
    {
        juce::StringArray files, errors;
        double seconds = 0.0;
    };

    explicit Recorder (AudioEngine& engine);
    ~Recorder() override;

    /** Message-Thread. Leer bei Erfolg, sonst die Fehlermeldung. */
    juce::String start (const Options& options);

    bool isRecording() const noexcept { return recording.load(); }

    /** Message-Thread: Stream-Uhr (s) des ersten aufgenommenen Samples, -1 solange noch keins da ist. */
    double getStartSec() const noexcept { return startSec.load(); }

    /** Message-Thread: beendet die Aufnahme; done kommt nach der Umwandlung auf dem Message-Thread. */
    void stop (std::function<void (Result)> done);

private:
    void run() override;
    void writeChunk (const AudioEngine::CaptureChunk& chunk);
    void writeSilence (juce::int64 frames);
    Result finish();

    AudioEngine& engine;
    Options opts;
    std::atomic<bool> recording { false }, stopRequested { false };
    std::atomic<double> startSec { -1.0 };
    std::function<void (Result)> onDone;

    double sampleRate = 48000.0;
    unsigned generation = 0;
    bool interrupted = false;
    long long nextSample = -1;  ///< erwartete Stream-Nummer des naechsten Blocks
    juce::int64 framesWritten = 0;
    juce::File dryTemp, wetTemp;
    std::unique_ptr<juce::AudioFormatWriter> dryWriter, wetWriter;
    std::vector<float> zeros;
};

} // namespace ft
