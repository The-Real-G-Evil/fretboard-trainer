#pragma once

#include "audio/Fft.h"

#include <complex>
#include <vector>

namespace ft
{

/** Monophone Tonhoehenerkennung nach YIN (de Cheveigne & Kawahara 2002).

    Die Differenzfunktion wird ueber FFT-Kreuzkorrelation berechnet, damit auch
    grosse Fenster (tiefes H des Basses, ~31 Hz) in Echtzeit moeglich sind.
    Die Fenstergroesse ergibt sich aus minHz: N = naechste Zweierpotenz >= 2 * sr / minHz
    (48 kHz: 55 Hz -> 2048, 28 Hz -> 4096).

    YIN waehlt die kleinste Periode, deren normierte Differenz unter der Schwelle liegt.
    Das verhindert die typischen Oktav-tiefer-Fehler der Autokorrelation.
*/
class PitchDetector
{
public:
    struct Config
    {
        double sampleRate  = 48000.0;
        float  minHz       = 55.0f;
        float  maxHz       = 1500.0f;
        float  threshold   = 0.15f;  ///< YIN-Schwelle fuer die erste Senke
        float  voicedLimit = 0.30f;  ///< oberhalb gilt der Frame als stimmlos
        float  silenceDb   = -65.0f; ///< RMS darunter -> stimmlos
    };

    struct Result
    {
        float hz         = 0.0f;
        float confidence = 0.0f; ///< 1 - normierte Differenz an der gewaehlten Periode
        bool  voiced     = false;
    };

    /** Alloziert; nicht im Audio-Thread aufrufen. */
    void prepare (const Config& config);

    const Config& getConfig() const noexcept { return cfg; }
    int getFrameSize() const noexcept { return frameSize; }

    /** Analysiert genau getFrameSize() Samples (aeltestes zuerst). Alloziert nicht. */
    Result detect (const float* frame) noexcept;

private:
    Config cfg;
    Fft fft;
    int frameSize = 0, window = 0, minLag = 2, maxLag = 2;

    std::vector<std::complex<float>> spectrumFrame, spectrumWindow;
    std::vector<double> prefixEnergy;
    std::vector<float> cmnd;
};

} // namespace ft
