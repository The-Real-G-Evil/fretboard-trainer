#include "app/Recorder.h"
#include "app/Mp3Encoder.h"

namespace ft
{

namespace
{
    constexpr int idleWaitMs = 10;

    std::unique_ptr<juce::AudioFormatWriter> createWriter (juce::AudioFormat& format, const juce::File& file,
                                                           const juce::AudioFormatWriterOptions& options)
    {
        file.deleteFile();
        std::unique_ptr<juce::OutputStream> out = std::make_unique<juce::FileOutputStream> (file);
        if (! static_cast<juce::FileOutputStream&> (*out).openedOk())
            return nullptr;
        return format.createWriterFor (out, options);
    }

    juce::String extensionFor (Recorder::Format f)
    {
        switch (f)
        {
            case Recorder::Format::wav:  return ".wav";
            case Recorder::Format::flac: return ".flac";
            case Recorder::Format::ogg:  return ".ogg";
            case Recorder::Format::mp3:  return ".mp3";
        }
        return {};
    }

    /** Eine Zieldatei aus der temporaeren Float-WAV erzeugen. Leer bei Erfolg. */
    juce::String convert (const juce::File& temp, const juce::File& target, Recorder::Format format, int lossyKbps)
    {
        juce::WavAudioFormat wav;
        std::unique_ptr<juce::AudioFormatReader> reader (wav.createReaderFor (temp.createInputStream().release(), true));
        if (reader == nullptr)
            return "Aufnahme nicht lesbar: " + temp.getFullPathName();

        if (format == Recorder::Format::mp3)
            return encodeMp3 (*reader, target, lossyKbps);

        const auto options = juce::AudioFormatWriterOptions {}
                                 .withSampleRate (reader->sampleRate)
                                 .withNumChannels (static_cast<int> (reader->numChannels))
                                 .withBitsPerSample (24);

        std::unique_ptr<juce::AudioFormatWriter> writer;
        if (format == Recorder::Format::wav)
        {
            juce::WavAudioFormat f;
            writer = createWriter (f, target, options);
        }
        else if (format == Recorder::Format::flac)
        {
            juce::FlacAudioFormat f;
            writer = createWriter (f, target, options);
        }
        else
        {
            juce::OggVorbisAudioFormat f;
            const auto qualities = f.getQualityOptions();
            int index = qualities.size() - 1;
            for (int i = 0; i < qualities.size(); ++i)
                if (qualities[i].getIntValue() >= lossyKbps) { index = i; break; }
            writer = createWriter (f, target, options.withBitsPerSample (16).withQualityOptionIndex (index));
        }

        if (writer == nullptr)
            return "Datei nicht anlegbar: " + target.getFullPathName();
        if (! writer->writeFromAudioReader (*reader, 0, -1))
            return "Schreiben fehlgeschlagen: " + target.getFullPathName();
        return {};
    }
}

Recorder::Recorder (AudioEngine& e)
    : juce::Thread ("Aufnahme"), engine (e)
{
}

Recorder::~Recorder()
{
    engine.setCaptureEnabled (false);
    stopRequested = true;
    stopThread (10000);
}

juce::String Recorder::start (const Options& options)
{
    if (recording.load() || isThreadRunning())
        return "Es laeuft bereits eine Aufnahme.";
    if ((! options.dry && ! options.wet) || options.formats.isEmpty())
        return "Kein Format gewaehlt.";
    if (! options.folder.createDirectory())
        return "Ordner nicht anlegbar: " + options.folder.getFullPathName();

    opts = options;
    sampleRate = engine.getSampleRate();
    generation = engine.getStreamGeneration();
    interrupted = false;
    nextSample = -1;
    framesWritten = 0;
    startSec = -1.0;
    zeros.assign (AudioEngine::CaptureChunk::capacity, 0.0f);

    juce::WavAudioFormat wav;
    const auto tempOptions = juce::AudioFormatWriterOptions {}
                                 .withSampleRate (sampleRate)
                                 .withBitsPerSample (32)
                                 .withSampleFormat (juce::AudioFormatWriterOptions::SampleFormat::floatingPoint);

    dryTemp = opts.folder.getChildFile ("." + opts.baseName + ".trocken.tmp.wav");
    wetTemp = opts.folder.getChildFile ("." + opts.baseName + ".effekte.tmp.wav");
    dryWriter = opts.dry ? createWriter (wav, dryTemp, tempOptions.withNumChannels (1)) : nullptr;
    wetWriter = opts.wet ? createWriter (wav, wetTemp, tempOptions.withNumChannels (2)) : nullptr;
    if ((opts.dry && dryWriter == nullptr) || (opts.wet && wetWriter == nullptr))
    {
        dryWriter = nullptr;
        wetWriter = nullptr;
        dryTemp.deleteFile();
        wetTemp.deleteFile();
        return "Datei nicht anlegbar in: " + opts.folder.getFullPathName();
    }

    // alte Bloecke verwerfen, dann Abgriff ein
    AudioEngine::CaptureChunk old;
    while (engine.popCaptureChunk (old)) {}
    stopRequested = false;
    recording = true;
    engine.setCaptureEnabled (true);
    startThread (juce::Thread::Priority::normal);
    return {};
}

void Recorder::stop (std::function<void (Result)> done)
{
    if (! recording.load())
    {
        if (done)
            done ({});
        return;
    }
    onDone = std::move (done);
    engine.setCaptureEnabled (false);
    stopRequested = true;
    notify();
}

void Recorder::writeSilence (juce::int64 frames)
{
    while (frames > 0)
    {
        const auto n = static_cast<int> (juce::jmin<juce::int64> (frames, static_cast<juce::int64> (zeros.size())));
        const float* mono[] = { zeros.data() };
        const float* stereo[] = { zeros.data(), zeros.data() };
        if (dryWriter != nullptr) dryWriter->writeFromFloatArrays (mono, 1, n);
        if (wetWriter != nullptr) wetWriter->writeFromFloatArrays (stereo, 2, n);
        framesWritten += n;
        frames -= n;
    }
}

void Recorder::writeChunk (const AudioEngine::CaptureChunk& c)
{
    if (nextSample < 0)
        startSec = static_cast<double> (c.streamSample) / sampleRate;
    else if (c.streamSample > nextSample)
        writeSilence (c.streamSample - nextSample); // verlorene Bloecke

    const float* mono[] = { c.dry.data() };
    const float* stereo[] = { c.wetLeft.data(), c.wetRight.data() };
    if (dryWriter != nullptr) dryWriter->writeFromFloatArrays (mono, 1, c.numSamples);
    if (wetWriter != nullptr) wetWriter->writeFromFloatArrays (stereo, 2, c.numSamples);
    framesWritten += c.numSamples;
    nextSample = c.streamSample + c.numSamples;
}

void Recorder::run()
{
    AudioEngine::CaptureChunk chunk;

    for (;;)
    {
        bool got = false;
        while (engine.popCaptureChunk (chunk))
        {
            got = true;
            if (engine.getStreamGeneration() != generation)
            {
                interrupted = true; // neue Stream-Uhr: Rest passt nicht mehr dazu
                engine.setCaptureEnabled (false);
                continue;
            }
            writeChunk (chunk);
        }

        if (stopRequested.load() && ! got)
            break;
        if (engine.getStreamGeneration() != generation && ! interrupted)
        {
            interrupted = true;
            engine.setCaptureEnabled (false);
        }
        if (! got)
            wait (idleWaitMs);
    }

    auto result = finish();
    recording = false;

    juce::MessageManager::callAsync ([this, result]
    {
        if (auto done = std::exchange (onDone, nullptr))
            done (result);
    });
}

Recorder::Result Recorder::finish()
{
    Result r;
    r.seconds = static_cast<double> (framesWritten) / sampleRate;
    dryWriter = nullptr; // schliesst die temporaeren Dateien
    wetWriter = nullptr;

    if (interrupted)
        r.errors.add ("Audiogeraet gewechselt - die Aufnahme wurde dort beendet.");

    struct Signal { bool on; juce::File temp; juce::String label; };
    const bool both = opts.dry && opts.wet;
    for (const auto& s : { Signal { opts.dry, dryTemp, opts.dryLabel }, Signal { opts.wet, wetTemp, opts.wetLabel } })
    {
        if (! s.on)
            continue;
        if (framesWritten > 0)
        {
            const auto name = opts.baseName + (both ? " (" + s.label + ")" : juce::String());
            for (const auto f : opts.formats)
            {
                const auto target = opts.folder.getChildFile (name + extensionFor (f));
                const auto error = convert (s.temp, target, f, opts.lossyKbps);
                if (error.isEmpty())
                    r.files.add (target.getFullPathName());
                else
                    r.errors.add (error);
            }
        }
        s.temp.deleteFile();
    }
    return r;
}

} // namespace ft
