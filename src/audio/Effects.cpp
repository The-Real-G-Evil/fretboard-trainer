#include "audio/Effects.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace ft
{

namespace
{
    constexpr double pi = std::numbers::pi;

    float dbToGain (float db) { return std::pow (10.0f, db / 20.0f); }

    Biquad normalised (double b0, double b1, double b2, double a0, double a1, double a2)
    {
        Biquad c;
        c.b0 = static_cast<float> (b0 / a0);
        c.b1 = static_cast<float> (b1 / a0);
        c.b2 = static_cast<float> (b2 / a0);
        c.a1 = static_cast<float> (a1 / a0);
        c.a2 = static_cast<float> (a2 / a0);
        return c;
    }

    double limitHz (double sampleRate, double hz) { return std::clamp (hz, 10.0, sampleRate * 0.45); }

    // Freeverb (Jezar at Dreampoint, gemeinfrei): Laengen bei 44,1 kHz
    constexpr std::array<int, 8> combTuning { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 };
    constexpr std::array<int, 4> allpassTuning { 556, 441, 341, 225 };
    constexpr int stereoSpread = 23;

    constexpr double chorusBaseMs = 12.0;
    constexpr double chorusMaxMs = 40.0;
    constexpr double delayMaxMs = 2100.0;

    /** Lineare Interpolation in einem Ringpuffer: Wert `delay` Samples vor `pos`. */
    float readDelayed (const std::vector<float>& buf, int pos, float delay) noexcept
    {
        const auto size = static_cast<int> (buf.size());
        auto read = static_cast<float> (pos) - delay;
        while (read < 0.0f)
            read += static_cast<float> (size);
        const auto i = static_cast<int> (read);
        const auto frac = read - static_cast<float> (i);
        const auto a = buf[static_cast<size_t> (i % size)];
        const auto b = buf[static_cast<size_t> ((i + 1) % size)];
        return a + (b - a) * frac;
    }
}

EffectParameters EffectParameters::clamped() const
{
    auto p = *this;
    p.compThresholdDb = std::clamp (p.compThresholdDb, -60.0f, 0.0f);
    p.compRatio = std::clamp (p.compRatio, 1.0f, 20.0f);
    p.compAttackMs = std::clamp (p.compAttackMs, 0.1f, 100.0f);
    p.compReleaseMs = std::clamp (p.compReleaseMs, 10.0f, 1000.0f);
    p.compMakeupDb = std::clamp (p.compMakeupDb, 0.0f, 24.0f);
    p.driveMode = std::clamp (p.driveMode, 0, 2);
    p.driveDb = std::clamp (p.driveDb, 0.0f, 40.0f);
    p.driveTone = std::clamp (p.driveTone, 0.0f, 1.0f);
    p.driveLevelDb = std::clamp (p.driveLevelDb, -24.0f, 6.0f);
    p.driveBlend = std::clamp (p.driveBlend, 0.0f, 1.0f);
    p.eqBassDb = std::clamp (p.eqBassDb, -12.0f, 12.0f);
    p.eqMidDb = std::clamp (p.eqMidDb, -12.0f, 12.0f);
    p.eqMidHz = std::clamp (p.eqMidHz, 200.0f, 4000.0f);
    p.eqTrebleDb = std::clamp (p.eqTrebleDb, -12.0f, 12.0f);
    p.chorusRateHz = std::clamp (p.chorusRateHz, 0.1f, 5.0f);
    p.chorusDepthMs = std::clamp (p.chorusDepthMs, 0.0f, 10.0f);
    p.chorusMix = std::clamp (p.chorusMix, 0.0f, 1.0f);
    p.delayMs = std::clamp (p.delayMs, 20.0f, 2000.0f);
    p.delayFeedback = std::clamp (p.delayFeedback, 0.0f, 0.95f);
    p.delayMix = std::clamp (p.delayMix, 0.0f, 1.0f);
    p.reverbSize = std::clamp (p.reverbSize, 0.0f, 1.0f);
    p.reverbDamping = std::clamp (p.reverbDamping, 0.0f, 1.0f);
    p.reverbMix = std::clamp (p.reverbMix, 0.0f, 1.0f);
    return p;
}

// ---------- Biquad

Biquad Biquad::lowShelf (double sampleRate, double hz, double gainDb)
{
    const auto a = std::pow (10.0, gainDb / 40.0);
    const auto w = 2.0 * pi * limitHz (sampleRate, hz) / sampleRate;
    const auto c = std::cos (w), s = std::sin (w);
    const auto alpha = s / 2.0 * std::sqrt (2.0); // Steilheit S = 1
    const auto sq = 2.0 * std::sqrt (a) * alpha;
    return normalised (a * ((a + 1) - (a - 1) * c + sq), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - sq),
                       (a + 1) + (a - 1) * c + sq, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - sq);
}

Biquad Biquad::highShelf (double sampleRate, double hz, double gainDb)
{
    const auto a = std::pow (10.0, gainDb / 40.0);
    const auto w = 2.0 * pi * limitHz (sampleRate, hz) / sampleRate;
    const auto c = std::cos (w), s = std::sin (w);
    const auto alpha = s / 2.0 * std::sqrt (2.0);
    const auto sq = 2.0 * std::sqrt (a) * alpha;
    return normalised (a * ((a + 1) + (a - 1) * c + sq), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - sq),
                       (a + 1) - (a - 1) * c + sq, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - sq);
}

Biquad Biquad::peak (double sampleRate, double hz, double gainDb, double q)
{
    const auto a = std::pow (10.0, gainDb / 40.0);
    const auto w = 2.0 * pi * limitHz (sampleRate, hz) / sampleRate;
    const auto c = std::cos (w);
    const auto alpha = std::sin (w) / (2.0 * q);
    return normalised (1 + alpha * a, -2 * c, 1 - alpha * a, 1 + alpha / a, -2 * c, 1 - alpha / a);
}

Biquad Biquad::lowPass (double sampleRate, double hz, double q)
{
    const auto w = 2.0 * pi * limitHz (sampleRate, hz) / sampleRate;
    const auto c = std::cos (w);
    const auto alpha = std::sin (w) / (2.0 * q);
    return normalised ((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

Biquad Biquad::highPass (double sampleRate, double hz, double q)
{
    const auto w = 2.0 * pi * limitHz (sampleRate, hz) / sampleRate;
    const auto c = std::cos (w);
    const auto alpha = std::sin (w) / (2.0 * q);
    return normalised ((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

void Smoothed::prepare (double sampleRate, float value) noexcept
{
    coeff = static_cast<float> (1.0 - std::exp (-1.0 / (0.02 * sampleRate)));
    current = target = value;
}

// ---------- Kette

void EffectChain::prepare (double sampleRate)
{
    sr = std::max (8000.0, sampleRate);

    chorusBuf.assign (static_cast<size_t> (chorusMaxMs / 1000.0 * sr) + 4, 0.0f);
    for (auto& b : delayBuf)
        b.assign (static_cast<size_t> (delayMaxMs / 1000.0 * sr) + 4, 0.0f);

    const auto scale = sr / 44100.0;
    for (int ch = 0; ch < 2; ++ch)
    {
        for (size_t i = 0; i < combs[0].size(); ++i)
            combs[static_cast<size_t> (ch)][i].buf.assign (static_cast<size_t> ((combTuning[i] + ch * stereoSpread) * scale), 0.0f);
        for (size_t i = 0; i < allpasses[0].size(); ++i)
            allpasses[static_cast<size_t> (ch)][i].buf.assign (static_cast<size_t> ((allpassTuning[i] + ch * stereoSpread) * scale), 0.0f);
    }

    const auto p = params;
    compOn.prepare (sr, p.compressorOn ? 1.0f : 0.0f);
    driveOnS.prepare (sr, p.driveOn ? 1.0f : 0.0f);
    eqOn.prepare (sr, p.eqOn ? 1.0f : 0.0f);
    chorusOn.prepare (sr, p.chorusOn ? 1.0f : 0.0f);
    delaySend.prepare (sr, p.delayOn ? 1.0f : 0.0f);
    reverbSend.prepare (sr, p.reverbOn ? 1.0f : 0.0f);
    chorusMix.prepare (sr, p.chorusMix);
    delaySamples.prepare (sr, static_cast<float> (p.delayMs / 1000.0 * sr));
    delayFeedback.prepare (sr, p.delayFeedback);
    delayMix.prepare (sr, p.delayMix);
    reverbMix.prepare (sr, p.reverbMix);
    reset();
    setParameters (p);
}

void EffectChain::reset() noexcept
{
    compEnvDb = 0.0f;
    for (auto* b : { &drivePre, &driveTone, &eqBass, &eqMid, &eqTreble })
        b->reset();
    std::fill (chorusBuf.begin(), chorusBuf.end(), 0.0f);
    chorusPos = 0;
    chorusPhase = 0.0;
    for (auto& b : delayBuf)
        std::fill (b.begin(), b.end(), 0.0f);
    delayPos = 0;
    delayDamp = { 0.0f, 0.0f };
    for (auto& ch : combs)
        for (auto& c : ch)
        {
            std::fill (c.buf.begin(), c.buf.end(), 0.0f);
            c.pos = 0;
            c.store = 0.0f;
        }
    for (auto& ch : allpasses)
        for (auto& a : ch)
        {
            std::fill (a.buf.begin(), a.buf.end(), 0.0f);
            a.pos = 0;
        }
}

void EffectChain::setParameters (const EffectParameters& raw) noexcept
{
    params = raw.clamped();
    const auto& p = params;

    compOn.target = p.compressorOn ? 1.0f : 0.0f;
    compAttack = static_cast<float> (std::exp (-1.0 / (p.compAttackMs / 1000.0 * sr)));
    compRelease = static_cast<float> (std::exp (-1.0 / (p.compReleaseMs / 1000.0 * sr)));
    compMakeup = dbToGain (p.compMakeupDb);

    driveOnS.target = p.driveOn ? 1.0f : 0.0f;
    driveGain = dbToGain (p.driveDb);
    driveLevel = dbToGain (p.driveLevelDb);
    drivePre.setFrom (Biquad::highPass (sr, 30.0));
    driveTone.setFrom (Biquad::lowPass (sr, 700.0 * std::pow (2.0, p.driveTone * 4.5)));

    eqOn.target = p.eqOn ? 1.0f : 0.0f;
    eqBass.setFrom (Biquad::lowShelf (sr, 100.0, p.eqBassDb));
    eqMid.setFrom (Biquad::peak (sr, p.eqMidHz, p.eqMidDb, 0.8));
    eqTreble.setFrom (Biquad::highShelf (sr, 3000.0, p.eqTrebleDb));

    chorusOn.target = p.chorusOn ? 1.0f : 0.0f;
    chorusMix.target = p.chorusMix;

    delaySend.target = p.delayOn ? 1.0f : 0.0f;
    delaySamples.target = static_cast<float> (p.delayMs / 1000.0 * sr);
    delayFeedback.target = p.delayFeedback;
    delayMix.target = p.delayMix;

    reverbSend.target = p.reverbOn ? 1.0f : 0.0f;
    roomFeedback = 0.7f + 0.28f * p.reverbSize;
    roomDamp = 0.4f * p.reverbDamping;
    reverbMix.target = p.reverbMix;
}

float EffectChain::compress (float x) noexcept
{
    // Pegel des Signals (Spitze, dB) -> noetige Absenkung; Absenkung mit Attack/Release geglaettet
    const auto levelDb = 20.0f * std::log10 (std::max (std::abs (x), 1e-6f));
    const auto over = levelDb - params.compThresholdDb;
    const auto reduction = over > 0.0f ? over * (1.0f - 1.0f / params.compRatio) : 0.0f;
    const auto coeff = reduction > compEnvDb ? compAttack : compRelease;
    compEnvDb = reduction + coeff * (compEnvDb - reduction);
    return x * compMakeup * dbToGain (-compEnvDb);
}

float EffectChain::drive (float x) noexcept
{
    const auto v = drivePre.process (x) * driveGain;
    float shaped;
    switch (params.driveMode)
    {
        case 1:  shaped = std::tanh (v + 0.25f) - std::tanh (0.25f); break; // asymmetrisch: auch gerade Obertoene
        case 2:  shaped = std::clamp (v * 1.5f, -1.0f, 1.0f); break;      // hart begrenzt
        default: shaped = std::tanh (v); break;
    }
    const auto toned = driveTone.process (shaped) * driveLevel;
    return toned * (1.0f - params.driveBlend) + x * params.driveBlend;
}

float EffectChain::equalise (float x) noexcept
{
    return eqTreble.process (eqMid.process (eqBass.process (x)));
}

void EffectChain::process (const float* in, float* left, float* right, int n) noexcept
{
    const auto chorusSize = static_cast<int> (chorusBuf.size());
    const auto delaySize = static_cast<int> (delayBuf[0].size());
    const auto lfoStep = 2.0 * pi * params.chorusRateHz / sr;
    const auto base = static_cast<float> (chorusBaseMs / 1000.0 * sr);
    const auto depth = static_cast<float> (params.chorusDepthMs / 1000.0 * sr);
    constexpr float fixedGain = 0.015f; // Freeverb

    for (int i = 0; i < n; ++i)
    {
        auto x = in[i];

        // Mono-Teil: Kompressor, Verzerrung, Equalizer (jeweils weich ueberblendet)
        if (const auto e = compOn.next(); e > 0.0f)
            x += (compress (x) - x) * e;
        if (const auto e = driveOnS.next(); e > 0.0f)
            x += (drive (x) - x) * e;
        if (const auto e = eqOn.next(); e > 0.0f)
            x += (equalise (x) - x) * e;

        // Chorus: zwei modulierte Abgriffe, rechts um 90 Grad versetzt
        float l = x, r = x;
        chorusBuf[static_cast<size_t> (chorusPos)] = x;
        const auto ce = chorusOn.next();
        const auto mix = chorusMix.next();
        if (ce > 0.0f)
        {
            const auto dl = base + depth * 0.5f * (1.0f + static_cast<float> (std::sin (chorusPhase)));
            const auto dr = base + depth * 0.5f * (1.0f + static_cast<float> (std::sin (chorusPhase + pi / 2.0)));
            const auto wl = readDelayed (chorusBuf, chorusPos, dl);
            const auto wr = readDelayed (chorusBuf, chorusPos, dr);
            l = x + ((x * (1.0f - 0.5f * mix) + wl * 0.7f * mix) - x) * ce;
            r = x + ((x * (1.0f - 0.5f * mix) + wr * 0.7f * mix) - x) * ce;
        }
        chorusPhase += lfoStep;
        if (chorusPhase > 2.0 * pi)
            chorusPhase -= 2.0 * pi;
        chorusPos = (chorusPos + 1) % chorusSize;

        // Delay: Send in die Leitung, Rueckkopplung mit leichter Hoehendaempfung
        const auto ds = delaySend.next();
        const auto dSamples = delaySamples.next();
        const auto fb = delayFeedback.next();
        const auto dMix = delayMix.next();
        std::array<float, 2> dry { l, r };
        for (size_t ch = 0; ch < 2; ++ch)
        {
            auto& buf = delayBuf[ch];
            const auto wet = readDelayed (buf, delayPos, dSamples);
            delayDamp[ch] += (wet - delayDamp[ch]) * 0.45f;
            buf[static_cast<size_t> (delayPos)] = dry[ch] * ds + delayDamp[ch] * fb;
            (ch == 0 ? l : r) += wet * dMix;
        }
        delayPos = (delayPos + 1) % delaySize;

        // Hall (Freeverb): Summe beider Kanaele als Send, Ausgang stereo
        const auto send = (dry[0] + dry[1]) * 0.5f * reverbSend.next() * fixedGain;
        const auto rMix = reverbMix.next();
        for (size_t ch = 0; ch < 2; ++ch)
        {
            float out = 0.0f;
            for (auto& c : combs[ch])
            {
                const auto y = c.buf[static_cast<size_t> (c.pos)];
                c.store = y * (1.0f - roomDamp) + c.store * roomDamp;
                c.buf[static_cast<size_t> (c.pos)] = send + c.store * roomFeedback;
                c.pos = (c.pos + 1) % static_cast<int> (c.buf.size());
                out += y;
            }
            for (auto& a : allpasses[ch])
            {
                const auto y = a.buf[static_cast<size_t> (a.pos)];
                a.buf[static_cast<size_t> (a.pos)] = out + y * 0.5f;
                a.pos = (a.pos + 1) % static_cast<int> (a.buf.size());
                out = y - out;
            }
            (ch == 0 ? l : r) += out * rMix * 3.0f;
        }

        left[i] = l;
        right[i] = r;
    }
}

} // namespace ft
