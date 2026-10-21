#pragma once

#include "audio/Fft.h"

#include <array>
#include <complex>
#include <optional>
#include <vector>

namespace ft
{

/** Anschlagserkennung aus spektralem Fluss und Huellkurve.

    Ein Anschlag liegt vor, wenn der spektrale Fluss (log-komprimierte Betragszunahme)
    ueber seiner gleitenden Schwelle liegt und zusaetzlich
      - die Huellkurve (Spitzenwertfolger, 30 ms Abfall) um minRiseDb ueber ihrem
        Hoechstwert der vorangehenden Hops liegt, oder
      - der Fluss die Schwelle um strongFluxFactor uebersteigt (breitbandiger Transient,
        auch bei leiserem Anschlag in einen noch klingenden Ton).
    Ein Tonhoehenwechsel ohne Transient und ohne Pegelanstieg (Hammer-on/Pull-off) erzeugt
    nur maessigen Fluss und loest daher keinen Anschlag aus.
    Der Zeitpunkt wird anschliessend auf einen 32-Sample-Block genau nachbestimmt.
*/
class OnsetDetector
{
public:
    struct Config
    {
        double sampleRate      = 48000.0;
        float  minRiseDb        = 3.0f;
        float  fluxMultiplier   = 1.5f;
        float  fluxDelta        = 0.01f;
        float  strongFluxFactor = 5.0f;
        float  minIntervalMs   = 50.0f;
        float  silenceDb       = -60.0f;
    };

    /** Alloziert; nicht im Audio-Thread aufrufen. */
    void prepare (const Config& config);
    void reset();

    int getHopSize() const noexcept    { return hopSize; }
    int getWindowSize() const noexcept { return windowSize; }

    /** Verarbeitet einen Hop. window enthaelt die letzten getWindowSize() Samples
        (aeltestes zuerst), deren letztes Sample den Index windowEndSample - 1 hat.
        Liefert den Sample-Index des Anschlags, falls einer erkannt wurde. */
    std::optional<long long> processHop (const float* window, long long windowEndSample, bool gateOpen) noexcept;

    /** Diagnosewerte des zuletzt verarbeiteten Hops. */
    float getLastFlux() const noexcept          { return lastFlux; }
    float getLastFluxThreshold() const noexcept { return lastFluxThreshold; }
    float getLastRiseDb() const noexcept        { return lastRiseDb; }

private:
    long long refineOnset (const float* window, long long windowEndSample) noexcept;

    static constexpr int historyHops = 8;
    static constexpr int refineBlock = 32;

    Config cfg;
    Fft fft;
    int hopSize = 256, windowSize = 1024, numBins = 513;
    std::vector<float> hann, prevMagnitude;
    std::vector<std::complex<float>> spectrum;
    std::vector<double> blockEnergy;

    float envelope = 0.0f, envelopeDecay = 0.0f;
    std::array<float, historyHops> fluxHistory {};
    std::array<float, historyHops> envelopeHistory {};
    int historyFill = 0;
    long long lastOnset = -1'000'000'000;
    float lastFlux = 0.0f, lastFluxThreshold = 0.0f, lastRiseDb = 0.0f;
};

} // namespace ft
