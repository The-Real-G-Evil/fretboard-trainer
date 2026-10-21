#pragma once

namespace ft
{

/** Noisegate fuer ein Mono-Signal.

    Detektor: Spitzenwert-Huellkurve (sofortiger Anstieg, ~10 ms Abfall).
    Logik:    oeffnet bei Huellkurve >= Schwelle, schliesst erst wenn die Huellkurve
              laenger als "Hold" unter (Schwelle - Hysterese) liegt.
    Verstaerkung: lineare Rampe 0 -> 1 in "Attack", 1 -> 0 in "Release".

    Echtzeitsicher: keine Allokationen, keine Locks. prepare() und setParameters()
    duerfen nicht gleichzeitig mit process() aus einem anderen Thread aufgerufen werden;
    die AudioEngine reicht Parameter dafuer ueber atomics in den Audio-Thread.
*/
class NoiseGate
{
public:
    struct Parameters
    {
        float thresholdDb  = -50.0f;
        float attackMs     = 1.0f;
        float holdMs       = 50.0f;
        float releaseMs    = 100.0f;
        float hysteresisDb = 6.0f;
    };

    void prepare (double sampleRate);
    void setParameters (const Parameters& p);
    const Parameters& getParameters() const noexcept { return params; }

    void reset();

    /** Verarbeitet den Puffer in-place. */
    void process (float* samples, int numSamples) noexcept;

    bool isOpen() const noexcept        { return open; }
    float getCurrentGain() const noexcept { return gain; }

private:
    void updateCoefficients();

    Parameters params;
    double sampleRate = 48000.0;

    // abgeleitete Werte
    float openThreshold  = 0.0f;
    float closeThreshold = 0.0f;
    float attackStep     = 1.0f;
    float releaseStep    = 1.0f;
    float envDecay       = 0.0f;
    int   holdSamples    = 0;

    // Zustand
    float envelope    = 0.0f;
    float gain        = 0.0f;
    int   holdCounter = 0;
    bool  open        = false;
};

} // namespace ft
