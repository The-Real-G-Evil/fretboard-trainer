#pragma once

#include <array>
#include <vector>

namespace ft
{

/** Effektkette fuer das Mithoeren (SPEC Abschnitt 7: Effekte, Phase 9).

    Feste Reihenfolge: Kompressor -> Verzerrung -> Equalizer -> Chorus -> Delay -> Hall.
    Alle Effekte arbeiten ohne zusaetzliche Latenz. Die Erkennung bekommt weiterhin das trockene
    Eingangssignal; die Kette veraendert nur, was man hoert.

    Ein-/Ausschalten blendet weich (keine Knackser); Delay und Hall sind als Send aufgebaut, ihre
    Fahnen klingen nach dem Ausschalten aus. Alles ist echtzeitfaehig: prepare() alloziert,
    setParameters() und process() nicht. */

struct EffectParameters
{
    bool  compressorOn = false;
    float compThresholdDb = -24.0f; ///< -60 .. 0
    float compRatio = 4.0f;         ///< 1 .. 20
    float compAttackMs = 5.0f;      ///< 0,1 .. 100
    float compReleaseMs = 150.0f;   ///< 10 .. 1000
    float compMakeupDb = 6.0f;      ///< 0 .. 24

    bool  driveOn = false;
    int   driveMode = 0;            ///< 0 Overdrive (weich), 1 Distortion (asymmetrisch), 2 Fuzz (hart)
    float driveDb = 18.0f;          ///< 0 .. 40
    float driveTone = 0.5f;         ///< 0 dunkel .. 1 hell
    float driveLevelDb = -6.0f;     ///< -24 .. +6
    float driveBlend = 0.0f;        ///< Anteil des unverzerrten Signals (Bass: Tiefen erhalten), 0 .. 1

    bool  eqOn = false;
    float eqBassDb = 0.0f;          ///< -12 .. +12, Kuhschwanz 100 Hz
    float eqMidDb = 0.0f;           ///< -12 .. +12, Glocke
    float eqMidHz = 800.0f;         ///< 200 .. 4000
    float eqTrebleDb = 0.0f;        ///< -12 .. +12, Kuhschwanz 3 kHz

    bool  chorusOn = false;
    float chorusRateHz = 0.8f;      ///< 0,1 .. 5
    float chorusDepthMs = 3.0f;     ///< 0 .. 10
    float chorusMix = 0.5f;         ///< 0 .. 1

    bool  delayOn = false;
    float delayMs = 350.0f;         ///< 20 .. 2000
    float delayFeedback = 0.35f;    ///< 0 .. 0,95
    float delayMix = 0.3f;          ///< 0 .. 1

    bool  reverbOn = false;
    float reverbSize = 0.6f;        ///< 0 .. 1
    float reverbDamping = 0.4f;     ///< 0 .. 1
    float reverbMix = 0.25f;        ///< 0 .. 1

    /** Werte in die erlaubten Bereiche bringen. */
    EffectParameters clamped() const;
};

/** Biquad (Direktform II transponiert), Koeffizienten nach R. Bristow-Johnson. */
struct Biquad
{
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float z1 = 0.0f, z2 = 0.0f;

    float process (float x) noexcept
    {
        const auto y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }
    void reset() noexcept { z1 = z2 = 0.0f; }
    /** Neue Koeffizienten, Zustand bleibt (weiche Uebergaenge beim Regeln). */
    void setFrom (const Biquad& c) noexcept { b0 = c.b0; b1 = c.b1; b2 = c.b2; a1 = c.a1; a2 = c.a2; }

    static Biquad lowShelf (double sampleRate, double hz, double gainDb);
    static Biquad highShelf (double sampleRate, double hz, double gainDb);
    static Biquad peak (double sampleRate, double hz, double gainDb, double q);
    static Biquad lowPass (double sampleRate, double hz, double q = 0.7071);
    static Biquad highPass (double sampleRate, double hz, double q = 0.7071);
};

/** Wert, der sich in ca. 20 ms an sein Ziel annaehert (gegen Zippergeraeusche). */
struct Smoothed
{
    float current = 0.0f, target = 0.0f, coeff = 0.0f;
    void prepare (double sampleRate, float value) noexcept;
    float next() noexcept { return current += (target - current) * coeff; }
};

class EffectChain
{
public:
    void prepare (double sampleRate);
    void reset() noexcept;

    /** Echtzeitfaehig (berechnet nur Koeffizienten). */
    void setParameters (const EffectParameters& p) noexcept;
    const EffectParameters& getParameters() const noexcept { return params; }

    /** Mono-Eingang -> Stereo-Ausgang (left/right duerfen nicht in aliasen). */
    void process (const float* in, float* left, float* right, int n) noexcept;

private:
    float compress (float x) noexcept;
    float drive (float x) noexcept;
    float equalise (float x) noexcept;

    double sr = 48000.0;
    EffectParameters params;

    // Ein/Aus weich
    Smoothed compOn, driveOnS, eqOn, chorusOn, delaySend, reverbSend;

    // Kompressor
    float compEnvDb = 0.0f, compAttack = 0.0f, compRelease = 0.0f, compMakeup = 1.0f;

    // Verzerrung
    Biquad drivePre, driveTone;
    float driveGain = 1.0f, driveLevel = 1.0f;

    // Equalizer
    Biquad eqBass, eqMid, eqTreble;

    // Chorus
    std::vector<float> chorusBuf;
    int chorusPos = 0;
    double chorusPhase = 0.0;
    Smoothed chorusMix;

    // Delay (je Kanal eine Leitung)
    std::array<std::vector<float>, 2> delayBuf;
    int delayPos = 0;
    Smoothed delaySamples, delayFeedback, delayMix;
    std::array<float, 2> delayDamp { 0.0f, 0.0f };

    // Hall (Freeverb: 8 Kammfilter + 4 Allpaesse je Kanal)
    struct Comb { std::vector<float> buf; int pos = 0; float store = 0.0f; };
    struct Allpass { std::vector<float> buf; int pos = 0; };
    std::array<std::array<Comb, 8>, 2> combs;
    std::array<std::array<Allpass, 4>, 2> allpasses;
    float roomFeedback = 0.84f, roomDamp = 0.2f;
    Smoothed reverbMix;
};

} // namespace ft
