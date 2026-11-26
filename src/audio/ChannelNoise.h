#pragma once

#include <cmath>

namespace ft
{

/** Pegelwerte eines Eingangskanals ueber eine kurze Messung (Summen ueber alle Samples). */
struct ChannelLevels
{
    double sumSquares = 0.0;      ///< Summe x^2
    double sumDiffSquares = 0.0;  ///< Summe (x[n] - x[n-1])^2: Hochpass, misst den Hoehenanteil
    long long samples = 0;
    float last = 0.0f;

    void add (const float* x, int n) noexcept
    {
        for (int i = 0; i < n; ++i)
        {
            const auto d = static_cast<double> (x[i]) - last;
            sumSquares += static_cast<double> (x[i]) * x[i];
            sumDiffSquares += d * d;
            last = x[i];
        }
        samples += n;
    }

    /** Gestoerter Kanal: lautes, breitbandiges Rauschen (z. B. Rocksmith-Kabel, Kanal 1).
        Ein Instrument hat seine Energie in den tiefen und mittleren Frequenzen: Die erste Differenz ist dort
        viel kleiner als das Signal selbst (100 Hz bei 48 kHz: ~1 %). Bei weissem Rauschen ist sie groesser
        (~141 %). Leise Kanaele (Grundrauschen, nichts angeschlossen) gelten nie als gestoert. */
    bool looksLikeNoise() const noexcept
    {
        if (samples <= 0)
            return false;
        const auto rms = std::sqrt (sumSquares / static_cast<double> (samples));
        const auto diffRms = std::sqrt (sumDiffSquares / static_cast<double> (samples));
        constexpr double minRms = 0.01;     // -40 dBFS: darunter leise genug, um nicht zu stoeren
        constexpr double minHighRatio = 0.5; // Hoehenanteil wie bei Rauschen
        return rms > minRms && diffRms > minHighRatio * rms;
    }
};

} // namespace ft
