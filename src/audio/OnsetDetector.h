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
    Der Zeitpunkt wird auf einen 32-Sample-Block genau nachbestimmt.

    Die Verarbeitung ist zweigeteilt: analyseHop() berechnet die vom Tuning unabhaengigen
    Merkmale, decide() trifft die Entscheidung. So kann die Kalibrierung Merkmale einmal
    berechnen und viele Parametersaetze schnell durchprobieren.
*/
class OnsetDetector
{
public:
    struct Config
    {
        double sampleRate       = 48000.0;
        float  minRiseDb        = 3.0f;
        float  fluxMultiplier   = 1.5f;
        float  fluxDelta        = 0.01f;
        float  strongFluxFactor = 10.0f;
        float  minIntervalMs    = 50.0f;
        float  silenceDb        = -60.0f;
    };

    /** Merkmale eines Hops (unabhaengig von minRiseDb/fluxMultiplier/strongFluxFactor). */
    struct HopFeatures
    {
        long long windowEndSample = 0;
        long long refinedOnset = 0;  ///< Anschlagszeitpunkt, falls dieser Hop einer ist
        float flux = 0.0f;
        float meanFlux = 0.0f;       ///< Mittel der vorangehenden Hops
        float riseDb = 0.0f;
        float envelopeDb = -100.0f;
        bool  warm = false;
        bool  gateOpen = false;
    };

    /** Alloziert; nicht im Audio-Thread aufrufen. */
    void prepare (const Config& config);
    void reset();

    /** Nur die Entscheidungsparameter tauschen (Zustand bleibt erhalten). */
    void setDecisionParameters (float minRiseDb, float fluxMultiplier, float strongFluxFactor) noexcept;

    int getHopSize() const noexcept    { return hopSize; }
    int getWindowSize() const noexcept { return windowSize; }

    /** Berechnet die Merkmale eines Hops. window enthaelt die letzten getWindowSize()
        Samples (aeltestes zuerst), deren letztes Sample den Index windowEndSample - 1 hat. */
    HopFeatures analyseHop (const float* window, long long windowEndSample, bool gateOpen) noexcept;

    /** Entscheidet ueber einen Anschlag; liefert dessen Sample-Index. */
    std::optional<long long> decide (const HopFeatures& f) noexcept;

    /** analyseHop() + decide(). */
    std::optional<long long> processHop (const float* window, long long windowEndSample, bool gateOpen) noexcept
    {
        lastFeatures = analyseHop (window, windowEndSample, gateOpen);
        return decide (lastFeatures);
    }

    /** Diagnosewerte des zuletzt verarbeiteten Hops. */
    float getLastFlux() const noexcept          { return lastFeatures.flux; }
    float getLastFluxThreshold() const noexcept { return cfg.fluxMultiplier * lastFeatures.meanFlux + cfg.fluxDelta; }
    float getLastRiseDb() const noexcept        { return lastFeatures.riseDb; }

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
    HopFeatures lastFeatures;
};

} // namespace ft
