#pragma once

#include <string>
#include <vector>

namespace ft::test
{

struct WavData
{
    double sampleRate = 0.0;
    std::vector<float> samples; ///< Kanal 1
};

/** Liest PCM 16/24/32 Bit und Float 32 Bit (WAVE_FORMAT_PCM / IEEE_FLOAT / EXTENSIBLE).
    Bei mehreren Kanaelen wird nur der erste zurueckgegeben. Wirft std::runtime_error. */
WavData readWav (const std::string& path);

/** Schreibt Mono, PCM 16 Bit. Wirft std::runtime_error. */
void writeWav16 (const std::string& path, const std::vector<float>& samples, double sampleRate);

} // namespace ft::test
