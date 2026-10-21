#include "audio/WavFile.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <stdexcept>

namespace ft
{

namespace
{
    uint32_t le32 (const unsigned char* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | (static_cast<uint32_t> (p[3]) << 24); }
    uint16_t le16 (const unsigned char* p) { return static_cast<uint16_t> (p[0] | (p[1] << 8)); }

    void put32 (std::ofstream& f, uint32_t v) { for (int i = 0; i < 4; ++i) f.put (static_cast<char> ((v >> (8 * i)) & 0xff)); }
    void put16 (std::ofstream& f, uint16_t v) { f.put (static_cast<char> (v & 0xff)); f.put (static_cast<char> (v >> 8)); }
}

WavData readWav (const std::filesystem::path& path)
{
    std::ifstream f (path, std::ios::binary);
    if (! f)
        throw std::runtime_error ("WAV nicht lesbar: " + path.string());

    std::vector<unsigned char> d ((std::istreambuf_iterator<char> (f)), std::istreambuf_iterator<char>());
    if (d.size() < 12 || std::memcmp (d.data(), "RIFF", 4) != 0 || std::memcmp (d.data() + 8, "WAVE", 4) != 0)
        throw std::runtime_error ("Keine WAV-Datei: " + path.string());

    uint16_t format = 0, channels = 0, bits = 0;
    uint32_t rate = 0;
    const unsigned char* data = nullptr;
    size_t dataSize = 0;

    for (size_t pos = 12; pos + 8 <= d.size();)
    {
        const auto size = le32 (&d[pos + 4]);
        const auto* body = &d[pos + 8];
        const auto avail = std::min<size_t> (size, d.size() - pos - 8);

        if (std::memcmp (&d[pos], "fmt ", 4) == 0 && avail >= 16)
        {
            format = le16 (body);
            channels = le16 (body + 2);
            rate = le32 (body + 4);
            bits = le16 (body + 14);
            if (format == 0xfffe && avail >= 26)
                format = le16 (body + 24); // Subformat-GUID beginnt mit dem Formatcode
        }
        else if (std::memcmp (&d[pos], "data", 4) == 0)
        {
            data = body;
            dataSize = avail;
        }

        pos += 8 + size + (size & 1);
    }

    if (data == nullptr || channels == 0 || (format != 1 && format != 3))
        throw std::runtime_error ("Nicht unterstuetztes WAV-Format: " + path.string());

    const auto bytes = bits / 8u;
    const auto frameBytes = bytes * channels;
    const auto frames = dataSize / frameBytes;

    WavData w;
    w.sampleRate = rate;
    w.samples.resize (frames);

    for (size_t i = 0; i < frames; ++i)
    {
        const auto* p = data + i * frameBytes;
        float v = 0.0f;

        if (format == 3 && bits == 32)       { std::memcpy (&v, p, 4); }
        else if (bits == 16)                 { v = static_cast<int16_t> (le16 (p)) / 32768.0f; }
        else if (bits == 24)                 { v = static_cast<float> (static_cast<int32_t> ((p[0] << 8) | (p[1] << 16) | (static_cast<uint32_t> (p[2]) << 24)) >> 8) / 8388608.0f; }
        else if (bits == 32)                 { v = static_cast<float> (static_cast<int32_t> (le32 (p))) / 2147483648.0f; }
        else throw std::runtime_error ("Nicht unterstuetzte Bittiefe: " + path.string());

        w.samples[i] = v;
    }

    return w;
}

void writeWav16 (const std::filesystem::path& path, const std::vector<float>& samples, double sampleRate)
{
    std::ofstream f (path, std::ios::binary);
    if (! f)
        throw std::runtime_error ("WAV nicht schreibbar: " + path.string());

    const auto rate = static_cast<uint32_t> (std::lround (sampleRate));
    const auto dataBytes = static_cast<uint32_t> (samples.size() * 2);

    f.write ("RIFF", 4); put32 (f, 36 + dataBytes); f.write ("WAVE", 4);
    f.write ("fmt ", 4); put32 (f, 16); put16 (f, 1); put16 (f, 1);
    put32 (f, rate); put32 (f, rate * 2); put16 (f, 2); put16 (f, 16);
    f.write ("data", 4); put32 (f, dataBytes);

    for (auto s : samples)
        put16 (f, static_cast<uint16_t> (static_cast<int16_t> (std::lround (std::clamp (s, -1.0f, 1.0f) * 32767.0f))));
}

void writeWavFloat (const std::filesystem::path& path, const std::vector<float>& samples, double sampleRate)
{
    std::ofstream f (path, std::ios::binary);
    if (! f)
        throw std::runtime_error ("WAV nicht schreibbar: " + path.string());

    const auto rate = static_cast<uint32_t> (std::lround (sampleRate));
    const auto dataBytes = static_cast<uint32_t> (samples.size() * 4);

    f.write ("RIFF", 4); put32 (f, 36 + dataBytes); f.write ("WAVE", 4);
    f.write ("fmt ", 4); put32 (f, 16); put16 (f, 3); put16 (f, 1);
    put32 (f, rate); put32 (f, rate * 4); put16 (f, 4); put16 (f, 32);
    f.write ("data", 4); put32 (f, dataBytes);

    for (auto s : samples)
    {
        uint32_t bits;
        std::memcpy (&bits, &s, 4);
        put32 (f, bits);
    }
}

} // namespace ft
