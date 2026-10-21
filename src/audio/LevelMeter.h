#pragma once

#include <algorithm>
#include <cmath>

namespace ft
{

/** Untergrenze fuer dB-Werte; Stille wird als dieser Wert gemeldet. */
inline constexpr float minusInfinityDb = -100.0f;

inline float dbToGain (float db) noexcept
{
    return db <= minusInfinityDb ? 0.0f : std::pow (10.0f, db * 0.05f);
}

inline float gainToDb (float gain) noexcept
{
    return gain > 0.0f ? std::max (minusInfinityDb, 20.0f * std::log10 (gain)) : minusInfinityDb;
}

/** Messwerte eines Audio-Blocks. Wird vom Audio-Thread per FIFO an die UI gereicht. */
struct LevelFrame
{
    double sumSquares = 0.0;
    int    numSamples = 0;
    float  peak       = 0.0f;
    bool   gateOpen   = false;
};

/** Misst einen Block (echtzeitsicher). */
LevelFrame measureBlock (const float* samples, int numSamples) noexcept;

/** Fasst mehrere Bloecke zusammen (UI-Thread, ca. 30 Hz). */
class LevelAccumulator
{
public:
    void add (const LevelFrame& f) noexcept;

    bool  isEmpty() const noexcept { return numSamples == 0; }
    float getRmsDb() const noexcept;
    float getPeakDb() const noexcept;
    /** true, wenn das Gate in irgendeinem der Bloecke offen war. */
    bool  wasGateOpen() const noexcept { return gateOpen; }

    void reset() noexcept { *this = {}; }

private:
    double sumSquares = 0.0;
    long long numSamples = 0;
    float peak = 0.0f;
    bool gateOpen = false;
};

} // namespace ft
