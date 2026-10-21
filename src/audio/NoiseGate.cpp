#include "audio/NoiseGate.h"
#include "audio/LevelMeter.h"

#include <algorithm>
#include <cmath>

namespace ft
{

namespace
{
    constexpr double detectorReleaseMs = 10.0;

    float stepForRamp (double ms, double sampleRate)
    {
        const auto samples = ms * 0.001 * sampleRate;
        return samples <= 1.0 ? 1.0f : static_cast<float> (1.0 / samples);
    }
}

void NoiseGate::prepare (double newSampleRate)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 48000.0;
    updateCoefficients();
    reset();
}

void NoiseGate::setParameters (const Parameters& p)
{
    params = p;
    params.attackMs     = std::max (0.0f, params.attackMs);
    params.holdMs       = std::max (0.0f, params.holdMs);
    params.releaseMs    = std::max (0.0f, params.releaseMs);
    params.hysteresisDb = std::max (0.0f, params.hysteresisDb);
    updateCoefficients();
}

void NoiseGate::reset()
{
    envelope    = 0.0f;
    gain        = 0.0f;
    holdCounter = 0;
    open        = false;
}

void NoiseGate::updateCoefficients()
{
    openThreshold  = dbToGain (params.thresholdDb);
    closeThreshold = dbToGain (params.thresholdDb - params.hysteresisDb);
    attackStep     = stepForRamp (params.attackMs, sampleRate);
    releaseStep    = stepForRamp (params.releaseMs, sampleRate);
    holdSamples    = static_cast<int> (std::lround (params.holdMs * 0.001 * sampleRate));
    envDecay       = static_cast<float> (std::exp (-1.0 / (detectorReleaseMs * 0.001 * sampleRate)));
}

void NoiseGate::process (float* samples, int numSamples) noexcept
{
    for (int i = 0; i < numSamples; ++i)
    {
        const auto x = samples[i];
        envelope = std::max (std::abs (x), envelope * envDecay);

        if (envelope >= openThreshold)
        {
            open = true;
            holdCounter = holdSamples;
        }
        else if (open)
        {
            if (envelope >= closeThreshold)
                holdCounter = holdSamples;
            else if (holdCounter > 0)
                --holdCounter;
            else
                open = false;
        }

        gain = open ? std::min (1.0f, gain + attackStep)
                    : std::max (0.0f, gain - releaseStep);

        samples[i] = x * gain;
    }
}

} // namespace ft
