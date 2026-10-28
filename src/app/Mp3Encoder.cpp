#include "app/Mp3Encoder.h"

#if JUCE_WINDOWS
 #include <windows.h>
 #include <mfapi.h>
 #include <mfidl.h>
 #include <mfreadwrite.h>
 #include <wrl/client.h>
 #pragma comment (lib, "mfplat.lib")
 #pragma comment (lib, "mfreadwrite.lib")
 #pragma comment (lib, "mfuuid.lib")
#else
 #include <lame.h>
#endif

namespace ft
{

#if JUCE_WINDOWS

namespace
{
    using Microsoft::WRL::ComPtr;

    constexpr int blockFrames = 4096;

    struct MfSession
    {
        HRESULT hr;
        MfSession()  : hr (MFStartup (MF_VERSION, MFSTARTUP_LITE)) {}
        ~MfSession() { if (SUCCEEDED (hr)) MFShutdown(); }
    };

    juce::String failed (const char* step, HRESULT hr)
    {
        return juce::String ("MP3: ") + step + " (0x" + juce::String::toHexString (static_cast<juce::uint32> (hr)) + ")";
    }
}

juce::String encodeMp3 (juce::AudioFormatReader& source, const juce::File& target, int kbps)
{
    // Immer stereo: der Encoder von Windows lehnt Mono-Eingang bei vielen Bitraten ab
    const int sourceChannels = juce::jlimit (1, 2, static_cast<int> (source.numChannels));
    const int channels = 2;
    const bool supportedRate = source.sampleRate == 32000.0 || source.sampleRate == 44100.0 || source.sampleRate == 48000.0;
    const int rate = supportedRate ? static_cast<int> (source.sampleRate) : 48000;

    // Quelle (bei Bedarf umgerechnet)
    juce::AudioFormatReaderSource readerSource (&source, false);
    juce::ResamplingAudioSource resampler (&readerSource, false, sourceChannels);
    resampler.setResamplingRatio (source.sampleRate / rate);
    resampler.prepareToPlay (blockFrames, rate);
    readerSource.prepareToPlay (blockFrames, source.sampleRate);
    const auto totalFrames = static_cast<juce::int64> (std::ceil (static_cast<double> (source.lengthInSamples) * rate / source.sampleRate));

    const MfSession session;
    if (FAILED (session.hr))
        return failed ("Media Foundation nicht verfuegbar", session.hr);

    target.deleteFile();

    ComPtr<IMFAttributes> attributes;
    MFCreateAttributes (&attributes, 1);
    attributes->SetGUID (MF_TRANSCODE_CONTAINERTYPE, MFTranscodeContainerType_MP3);

    ComPtr<IMFSinkWriter> writer;
    auto hr = MFCreateSinkWriterFromURL (target.getFullPathName().toWideCharPointer(), nullptr, attributes.Get(), &writer);
    if (FAILED (hr))
        return failed ("Datei nicht anlegbar", hr);

    ComPtr<IMFMediaType> outType;
    MFCreateMediaType (&outType);
    outType->SetGUID (MF_MT_MAJOR_TYPE, MFMediaType_Audio);
    outType->SetGUID (MF_MT_SUBTYPE, MFAudioFormat_MP3);
    outType->SetUINT32 (MF_MT_AUDIO_SAMPLES_PER_SECOND, static_cast<UINT32> (rate));
    outType->SetUINT32 (MF_MT_AUDIO_NUM_CHANNELS, static_cast<UINT32> (channels));
    outType->SetUINT32 (MF_MT_AUDIO_AVG_BYTES_PER_SECOND, static_cast<UINT32> (juce::jlimit (32, 320, kbps) * 1000 / 8));

    DWORD stream = 0;
    hr = writer->AddStream (outType.Get(), &stream);
    if (FAILED (hr))
        return failed ("Format nicht unterstuetzt", hr);

    ComPtr<IMFMediaType> inType;
    MFCreateMediaType (&inType);
    inType->SetGUID (MF_MT_MAJOR_TYPE, MFMediaType_Audio);
    inType->SetGUID (MF_MT_SUBTYPE, MFAudioFormat_PCM);
    inType->SetUINT32 (MF_MT_AUDIO_BITS_PER_SAMPLE, 16);
    inType->SetUINT32 (MF_MT_AUDIO_SAMPLES_PER_SECOND, static_cast<UINT32> (rate));
    inType->SetUINT32 (MF_MT_AUDIO_NUM_CHANNELS, static_cast<UINT32> (channels));
    inType->SetUINT32 (MF_MT_AUDIO_BLOCK_ALIGNMENT, static_cast<UINT32> (channels * 2));
    inType->SetUINT32 (MF_MT_AUDIO_AVG_BYTES_PER_SECOND, static_cast<UINT32> (rate * channels * 2));

    hr = writer->SetInputMediaType (stream, inType.Get(), nullptr);
    if (FAILED (hr))
        return failed ("Eingangsformat nicht unterstuetzt", hr);

    hr = writer->BeginWriting();
    if (FAILED (hr))
        return failed ("Schreiben nicht moeglich", hr);

    juce::AudioBuffer<float> block (sourceChannels, blockFrames);
    juce::int64 written = 0;

    while (written < totalFrames)
    {
        const auto frames = static_cast<int> (juce::jmin<juce::int64> (blockFrames, totalFrames - written));
        juce::AudioSourceChannelInfo info (&block, 0, frames);
        resampler.getNextAudioBlock (info);

        ComPtr<IMFMediaBuffer> buffer;
        const auto bytes = static_cast<DWORD> (frames * channels * 2);
        if (FAILED (hr = MFCreateMemoryBuffer (bytes, &buffer)))
            return failed ("Speicher", hr);

        BYTE* data = nullptr;
        buffer->Lock (&data, nullptr, nullptr);
        auto* pcm = reinterpret_cast<juce::int16*> (data);
        for (int i = 0; i < frames; ++i)
            for (int ch = 0; ch < channels; ++ch)
                *pcm++ = static_cast<juce::int16> (juce::roundToInt (juce::jlimit (-1.0f, 1.0f, block.getSample (juce::jmin (ch, sourceChannels - 1), i)) * 32767.0f));
        buffer->Unlock();
        buffer->SetCurrentLength (bytes);

        ComPtr<IMFSample> sample;
        MFCreateSample (&sample);
        sample->AddBuffer (buffer.Get());
        sample->SetSampleTime (written * 10'000'000 / rate);   // 100-ns-Einheiten
        sample->SetSampleDuration (static_cast<LONGLONG> (frames) * 10'000'000 / rate);

        if (FAILED (hr = writer->WriteSample (stream, sample.Get())))
            return failed ("Schreiben fehlgeschlagen", hr);

        written += frames;
    }

    if (FAILED (hr = writer->Finalize()))
        return failed ("Abschluss fehlgeschlagen", hr);

    return {};
}

#else

namespace
{
    constexpr int blockFrames = 4096;

    struct LameSession
    {
        lame_global_flags* flags = lame_init();
        ~LameSession() { if (flags != nullptr) lame_close (flags); }
    };
}

juce::String encodeMp3 (juce::AudioFormatReader& source, const juce::File& target, int kbps)
{
    // LAME rechnet andere Abtastraten selbst um und schreibt Mono als Mono
    const int channels = juce::jlimit (1, 2, static_cast<int> (source.numChannels));

    const LameSession session;
    auto* gf = session.flags;
    if (gf == nullptr)
        return "MP3: LAME nicht verfuegbar";

    lame_set_in_samplerate (gf, static_cast<int> (source.sampleRate));
    lame_set_num_channels (gf, channels);
    lame_set_mode (gf, channels == 1 ? MONO : JOINT_STEREO);
    lame_set_brate (gf, juce::jlimit (32, 320, kbps));
    lame_set_quality (gf, 2);
    lame_set_write_id3tag_automatic (gf, 0);
    if (lame_init_params (gf) < 0)
        return "MP3: Format nicht unterstuetzt";

    target.deleteFile();
    juce::FileOutputStream out (target);
    if (! out.openedOk())
        return "MP3: Datei nicht anlegbar";

    juce::AudioBuffer<float> block (channels, blockFrames);
    std::vector<unsigned char> mp3 (static_cast<size_t> (blockFrames * 5 / 4 + 7200));

    for (juce::int64 pos = 0; pos < source.lengthInSamples; pos += blockFrames)
    {
        const auto frames = static_cast<int> (juce::jmin<juce::int64> (blockFrames, source.lengthInSamples - pos));
        if (! source.read (&block, 0, frames, pos, true, channels > 1))
            return "MP3: Aufnahme nicht lesbar";

        const auto bytes = lame_encode_buffer_ieee_float (gf, block.getReadPointer (0), block.getReadPointer (channels - 1),
                                                          frames, mp3.data(), static_cast<int> (mp3.size()));
        if (bytes < 0 || ! out.write (mp3.data(), static_cast<size_t> (bytes)))
            return "MP3: Schreiben fehlgeschlagen";
    }

    const auto bytes = lame_encode_flush (gf, mp3.data(), static_cast<int> (mp3.size()));
    if (bytes < 0 || ! out.write (mp3.data(), static_cast<size_t> (bytes)))
        return "MP3: Abschluss fehlgeschlagen";

    out.flush();
    return out.getStatus().wasOk() ? juce::String() : "MP3: Schreiben fehlgeschlagen";
}

#endif

} // namespace ft
