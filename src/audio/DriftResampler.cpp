#include "audio/DriftResampler.h"

#include <algorithm>
#include <cmath>

namespace ft
{

namespace
{
    constexpr double fillSmoothingSec = 0.5;   // Glaettung des Fuellstands (Blockraster herausmitteln)
    constexpr double loopTimeSec      = 4.0;   // Zeitkonstante der Regelung
    constexpr double maxCorrection    = 0.002; // +-2000 ppm, reale Quarze liegen weit darunter
    constexpr int    guardSamples     = 4;     // Interpolation braucht p-1 .. p+2

    /** Hermite-Interpolation (4 Punkte, 3. Ordnung) zwischen y0 und y1. */
    inline float hermite (float ym1, float y0, float y1, float y2, float t) noexcept
    {
        const auto c1 = 0.5f * (y1 - ym1);
        const auto c2 = ym1 - 2.5f * y0 + 2.0f * y1 - 0.5f * y2;
        const auto c3 = 0.5f * (y2 - ym1) + 1.5f * (y0 - y1);
        return ((c3 * t + c2) * t + c1) * t + y0;
    }

    std::size_t nextPowerOfTwo (std::size_t v) noexcept
    {
        std::size_t p = 1;
        while (p < v)
            p <<= 1;
        return p;
    }
}

void DriftResampler::prepare (double inputRate, double outputRate, int maxInBlock, int maxOutBlock)
{
    inRate = std::max (1.0, inputRate);
    nominalRatio = inRate / std::max (1.0, outputRate);

    // Soll: beide Bloecke passen hinein, plus kleine Reserve fuer Planungsschwankungen der Threads.
    // Knapp gewaehlt (jede Reserve ist Latenz); bei Aussetzern waechst das Soll von selbst.
    const auto inBlock  = static_cast<double> (std::max (1, maxInBlock));
    const auto outBlock = static_cast<double> (std::max (1, maxOutBlock)) * nominalRatio;
    setTarget (std::ceil (inBlock + outBlock) + 64.0);

    const auto capacity = nextPowerOfTwo (std::max<std::size_t> (16384, static_cast<std::size_t> (16.0 * target)));
    buffer.assign (capacity, 0.0f);
    mask = capacity - 1;

    writePos.store (0, std::memory_order_relaxed);
    readPos.store (0, std::memory_order_relaxed);
    resetRequested.store (false, std::memory_order_relaxed);
    underruns.store (0, std::memory_order_relaxed);
    overruns.store (0, std::memory_order_relaxed);

    kp = 1.0 / loopTimeSec;
    ki = kp * kp / 4.0; // kritisch gedaempft
    primed = false;
    frac = correction = integral = shownPpm = 0.0;
    smoothedFill = target;
    statRatioPpm.store (0.0, std::memory_order_relaxed);
    statFill.store (0.0, std::memory_order_relaxed);
}

void DriftResampler::write (const float* samples, int numSamples) noexcept
{
    if (buffer.empty() || numSamples <= 0)
        return;

    const auto w = writePos.load (std::memory_order_relaxed);
    const auto r = readPos.load (std::memory_order_acquire);
    const auto used = static_cast<std::size_t> (w - r) + 1; // p-1 braucht der Leser noch
    const auto capacity = buffer.size();

    if (used + static_cast<std::size_t> (numSamples) + guardSamples > capacity)
    {
        // Leser haengt (Ausgang gestoppt): Block verwerfen, der Leser synchronisiert sich neu
        overruns.fetch_add (1, std::memory_order_relaxed);
        return;
    }

    for (int i = 0; i < numSamples; ++i)
        buffer[static_cast<std::size_t> (w + static_cast<std::uint64_t> (i)) & mask] = samples[i];

    writePos.store (w + static_cast<std::uint64_t> (numSamples), std::memory_order_release);
}

std::size_t DriftResampler::available() const noexcept
{
    const auto w = writePos.load (std::memory_order_acquire);
    const auto r = readPos.load (std::memory_order_relaxed);
    return static_cast<std::size_t> (w - r);
}

void DriftResampler::resync (std::uint64_t w) noexcept
{
    // Leseposition so setzen, dass genau der Sollfuellstand ansteht (aeltere Daten verwerfen)
    const auto t = static_cast<std::uint64_t> (target);
    readPos.store (w - std::min (w, t) + 1, std::memory_order_release);
    frac = 0.0;
    integral = 0.0;
    correction = 0.0;
    smoothedFill = target;
    primed = true;
}

void DriftResampler::read (float* out, int numSamples) noexcept
{
    if (numSamples <= 0)
        return;

    if (buffer.empty())
    {
        std::fill (out, out + numSamples, 0.0f);
        return;
    }

    if (resetRequested.exchange (false, std::memory_order_acq_rel))
        primed = false;

    auto avail = available();

    // Lange nicht gelesen (Ausgang stand) -> Ueberhang verwerfen
    if (primed && avail > buffer.size() / 2)
        primed = false;

    if (! primed)
    {
        if (static_cast<double> (avail) < target + guardSamples)
        {
            std::fill (out, out + numSamples, 0.0f);
            return;
        }
        resync (writePos.load (std::memory_order_acquire));
        avail = available();
    }

    const auto step = nominalRatio * (1.0 + correction);
    const auto needed = frac + static_cast<double> (numSamples) * step + 3.0;

    if (needed > static_cast<double> (avail))
    {
        // Eingang liefert zu wenig (Aussetzer, Geraet weg): Stille, Puffer etwas vergroessern
        underruns.fetch_add (1, std::memory_order_relaxed);
        setTarget (std::min (target * 1.25, static_cast<double> (buffer.size()) / 4.0));
        primed = false;
        std::fill (out, out + numSamples, 0.0f);
        return;
    }

    auto p = readPos.load (std::memory_order_relaxed);
    auto f = frac;

    for (int i = 0; i < numSamples; ++i)
    {
        out[i] = hermite (at (p - 1), at (p), at (p + 1), at (p + 2), static_cast<float> (f));
        f += step;
        const auto whole = std::floor (f);
        p += static_cast<std::uint64_t> (whole);
        f -= whole;
    }

    frac = f;
    readPos.store (p, std::memory_order_release);

    // Regelung: Fuellstand (in Eingangssamples) gegen Soll
    const auto w = writePos.load (std::memory_order_acquire);
    const auto fill = static_cast<double> (w - p) - frac;
    const auto dt = static_cast<double> (numSamples) * nominalRatio / inRate; // Dauer des Blocks
    const auto alpha = 1.0 - std::exp (-dt / fillSmoothingSec);
    smoothedFill += alpha * (fill - smoothedFill);

    const auto error = (smoothedFill - target) / inRate; // Sekunden Ueberschuss
    integral = std::clamp (integral + error * dt, -maxCorrection / ki, maxCorrection / ki);
    correction = std::clamp (kp * error + ki * integral, -maxCorrection, maxCorrection);

    // Anzeige: geschaetzte Drift = I-Anteil (der P-Anteil zittert mit dem Blockraster), geglaettet
    shownPpm += (1.0 - std::exp (-dt / 2.0)) * (ki * integral * 1.0e6 - shownPpm);
    statRatioPpm.store (shownPpm, std::memory_order_relaxed);
    statFill.store (smoothedFill, std::memory_order_relaxed);
}

void DriftResampler::setTarget (double t) noexcept
{
    target = t;
    statTarget.store (t, std::memory_order_relaxed);
}

DriftResampler::Stats DriftResampler::getStats() const noexcept
{
    Stats s;
    s.ratioPpm    = statRatioPpm.load (std::memory_order_relaxed);
    s.fillSamples = statFill.load (std::memory_order_relaxed);
    s.targetFill  = statTarget.load (std::memory_order_relaxed);
    s.underruns   = underruns.load (std::memory_order_relaxed);
    s.overruns    = overruns.load (std::memory_order_relaxed);
    return s;
}

} // namespace ft
