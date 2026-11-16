#pragma once

#include <atomic>
#include <cstdint>
#include <vector>

namespace ft
{

/** Bruecke zwischen zwei Audiogeraeten mit eigener Uhr (z. B. Rocksmith-Kabel als Eingang,
    Kopfhoerer als Ausgang): Ringpuffer plus adaptiver Resampler.

    Der Schreiber (Callback des Eingangsgeraets) legt Samples ab, der Leser (Callback des
    Ausgangsgeraets) holt genau so viele Samples, wie er braucht. Das Verhaeltnis der
    Abtastraten wird ueber den Fuellstand nachgeregelt: laeuft der Eingang etwas schneller,
    waechst der Puffer und der Leser verbraucht etwas mehr Eingangssamples je Ausgangssample
    (und umgekehrt). So gibt es weder Aussetzer noch Ueberlaeufe, die Tonhoehe aendert sich nur
    im ppm-Bereich (unhoerbar, fuer die Tonerkennung bedeutungslos).

    Ein Schreiber, ein Leser, lock-frei, keine Allokation ausserhalb von prepare().
    Unterschiedliche Nennraten (z. B. 48 kHz -> 44,1 kHz) werden mit umgerechnet.
*/
class DriftResampler
{
public:
    struct Stats
    {
        double ratioPpm = 0.0;     ///< Abweichung vom Nennverhaeltnis (Regelgroesse) in ppm
        double fillSamples = 0.0;  ///< geglaetteter Fuellstand (Eingangssamples)
        double targetFill = 0.0;   ///< Sollfuellstand (Eingangssamples)
        unsigned underruns = 0;    ///< Leser fand zu wenig Daten (Stille ausgegeben)
        unsigned overruns = 0;     ///< Schreiber fand keinen Platz (Daten verworfen)
    };

    /** Nicht waehrend der Callbacks aufrufen (beide Geraete gestoppt).
        maxInBlock/maxOutBlock: groesste Blockgroessen der beiden Geraete. */
    void prepare (double inputRate, double outputRate, int maxInBlock, int maxOutBlock);

    /** Schreiber-Thread. */
    void write (const float* samples, int numSamples) noexcept;

    /** Leser-Thread: fuellt out mit genau numSamples Werten (bei Mangel Stille). */
    void read (float* out, int numSamples) noexcept;

    /** Leser-Thread: alles verwerfen und neu fuellen (z. B. nach einem Neustart des Eingangs). */
    void requestReset() noexcept { resetRequested.store (true, std::memory_order_release); }

    /** Beliebiger Thread. */
    Stats getStats() const noexcept;

    /** Zusaetzliche Verzoegerung durch den Puffer in Millisekunden (Sollfuellstand). */
    double getLatencyMs() const noexcept
    {
        return inRate > 0.0 ? 1000.0 * statTarget.load (std::memory_order_relaxed) / inRate : 0.0;
    }

private:
    std::size_t available() const noexcept;
    float at (std::uint64_t index) const noexcept { return buffer[static_cast<std::size_t> (index) & mask]; }
    void resync (std::uint64_t writePos) noexcept;
    void setTarget (double t) noexcept;

    std::vector<float> buffer;
    std::size_t mask = 0;

    alignas (64) std::atomic<std::uint64_t> writePos { 0 };
    alignas (64) std::atomic<std::uint64_t> readPos { 0 };

    // Leser-Zustand
    double frac = 0.0;          ///< Nachkommaanteil der Leseposition
    double nominalRatio = 1.0;  ///< Eingangssamples je Ausgangssample laut Nennraten
    double correction = 0.0;    ///< Regelanteil (relativ)
    double integral = 0.0;
    double smoothedFill = 0.0;
    double target = 0.0;
    double kp = 0.0, ki = 0.0;
    double shownPpm = 0.0;
    double inRate = 0.0;
    bool primed = false;
    std::atomic<bool> resetRequested { false };

    std::atomic<unsigned> underruns { 0 }, overruns { 0 };
    std::atomic<double> statRatioPpm { 0.0 }, statFill { 0.0 }, statTarget { 0.0 };
};

} // namespace ft
