#include "audio/LevelMeter.h"

#include <algorithm>

namespace ft
{

LevelFrame measureBlock (const float* samples, int numSamples) noexcept
{
    LevelFrame f;
    f.numSamples = std::max (0, numSamples);

    for (int i = 0; i < f.numSamples; ++i)
    {
        const auto x = samples[i];
        f.sumSquares += static_cast<double> (x) * x;
        f.peak = std::max (f.peak, std::abs (x));
    }

    return f;
}

void LevelAccumulator::add (const LevelFrame& f) noexcept
{
    sumSquares += f.sumSquares;
    numSamples += f.numSamples;
    peak = std::max (peak, f.peak);
    gateOpen = gateOpen || f.gateOpen;
}

float LevelAccumulator::getRmsDb() const noexcept
{
    if (numSamples == 0)
        return minusInfinityDb;

    return gainToDb (static_cast<float> (std::sqrt (sumSquares / static_cast<double> (numSamples))));
}

float LevelAccumulator::getPeakDb() const noexcept
{
    return gainToDb (peak);
}

} // namespace ft
