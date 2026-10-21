#include "audio/Calibration.h"
#include "audio/LevelMeter.h"
#include "audio/OfflineAnalysis.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace ft
{

//==============================================================================
TakeScore scoreTake (const std::vector<ExpectedNote>& expected, const std::vector<NoteEvent>& detected)
{
    const auto n = expected.size();
    const auto m = detected.size();

    auto matchCost = [&] (size_t i, size_t j)
    {
        if (expected[i].midi != detected[j].midi)
            return 1.0;
        return expected[i].type == detected[j].onsetType ? 0.0 : 0.5;
    };

    // Editierdistanz: Ersetzen = matchCost, Einfuegen/Loeschen = 1
    std::vector<std::vector<double>> d (n + 1, std::vector<double> (m + 1, 0.0));
    for (size_t i = 1; i <= n; ++i) d[i][0] = static_cast<double> (i);
    for (size_t j = 1; j <= m; ++j) d[0][j] = static_cast<double> (j);

    for (size_t i = 1; i <= n; ++i)
        for (size_t j = 1; j <= m; ++j)
            d[i][j] = std::min ({ d[i - 1][j - 1] + matchCost (i - 1, j - 1),
                                  d[i - 1][j] + 1.0,
                                  d[i][j - 1] + 1.0 });

    TakeScore s;
    s.expected = static_cast<int> (n);
    s.errorCost = d[n][m];

    // Rueckverfolgung (Diagonale bevorzugt)
    for (size_t i = n, j = m; i > 0 || j > 0;)
    {
        AlignedNote a;

        if (i > 0 && j > 0 && std::abs (d[i][j] - (d[i - 1][j - 1] + matchCost (i - 1, j - 1))) < 1e-9)
        {
            a.expectedIndex = static_cast<int> (i - 1);
            a.detectedIndex = static_cast<int> (j - 1);
            const auto c = matchCost (i - 1, j - 1);
            a.kind = c == 0.0 ? AlignKind::correct : c == 0.5 ? AlignKind::wrongType : AlignKind::wrongPitch;
            --i; --j;
        }
        else if (i > 0 && std::abs (d[i][j] - (d[i - 1][j] + 1.0)) < 1e-9)
        {
            a.expectedIndex = static_cast<int> (i - 1);
            a.kind = AlignKind::missing;
            --i;
        }
        else
        {
            a.detectedIndex = static_cast<int> (j - 1);
            a.kind = AlignKind::extra;
            --j;
        }

        s.alignment.push_back (a);
    }

    std::reverse (s.alignment.begin(), s.alignment.end());

    for (const auto& a : s.alignment)
    {
        switch (a.kind)
        {
            case AlignKind::correct:    ++s.correct; break;
            case AlignKind::wrongType:  ++s.wrongType; break;
            case AlignKind::wrongPitch: ++s.wrongPitch; break;
            case AlignKind::missing:    ++s.missing; break;
            case AlignKind::extra:      ++s.extra; break;
        }
    }

    s.accuracy = n > 0 ? std::clamp (1.0 - s.errorCost / static_cast<double> (n), 0.0, 1.0) : 0.0;
    return s;
}

//==============================================================================
NoiseProfile measureNoise (const std::vector<float>& signal, double sampleRate)
{
    NoiseProfile p;
    const auto skip = static_cast<size_t> (0.2 * sampleRate);

    if (signal.size() <= 2 * skip)
        return p;

    const auto block = std::max<size_t> (1, static_cast<size_t> (0.01 * sampleRate));
    std::vector<float> blockPeaks;
    double sumSquares = 0.0;
    float peak = 0.0f, blockPeak = 0.0f;

    for (size_t i = skip; i < signal.size() - skip; ++i)
    {
        const auto a = std::abs (signal[i]);
        sumSquares += static_cast<double> (signal[i]) * signal[i];
        peak = std::max (peak, a);
        blockPeak = std::max (blockPeak, a);

        if ((i - skip + 1) % block == 0)
        {
            blockPeaks.push_back (blockPeak);
            blockPeak = 0.0f;
        }
    }

    if (blockPeaks.empty())
        blockPeaks.push_back (blockPeak);

    const auto p95 = blockPeaks.begin() + static_cast<std::ptrdiff_t> ((blockPeaks.size() - 1) * 95 / 100);
    std::nth_element (blockPeaks.begin(), p95, blockPeaks.end());

    p.peakDb = gainToDb (peak);
    p.typicalPeakDb = gainToDb (*p95);
    p.rmsDb = gainToDb (static_cast<float> (std::sqrt (sumSquares / static_cast<double> (signal.size() - 2 * skip))));
    p.quiet = p.typicalPeakDb <= quietLimitDb;
    p.suggestedGateDb = std::clamp (std::round ((p.typicalPeakDb + 6.0f) * 2.0f) / 2.0f, -90.0f, maxSuggestedGateDb);
    return p;
}

//==============================================================================
CalibrationTake makeCalibrationTake (const std::vector<float>& signal, double sampleRate,
                                     const ExpectedNotes& expected, const NoiseGate::Parameters& gate)
{
    CalibrationTake take;
    take.expected = expected;

    OfflineOptions o;
    o.minHz = expected.minHz;
    o.maxHz = expected.maxHz;
    o.gate = gate;
    o.recording = &take.recording;
    analyseOffline (signal, sampleRate, o);
    return take;
}

TuningEvaluation evaluateTuning (const std::vector<CalibrationTake>& takes, const DetectionTuning& tuning)
{
    TuningEvaluation e;
    e.tuning = tuning;

    for (const auto& t : takes)
    {
        const auto out = Analyzer::replay (t.recording, tuning);
        e.scores.push_back (scoreTake (t.expected.notes, out.notes));
        e.totalCost += e.scores.back().errorCost;
    }

    return e;
}

std::vector<DetectionTuning> tuningCandidates()
{
    std::vector<DetectionTuning> c;

    for (float rise : { 1.5f, 2.0f, 3.0f, 4.5f, 6.0f })
        for (float strong : { 3.0f, 4.0f, 5.0f, 7.0f, 10.0f, 14.0f, 20.0f, 28.0f })
            for (float mult : { 1.2f, 1.5f, 2.0f })
                for (int stable : { 2, 3, 4 })
                    for (int legato : { 4, 8, 12, 18 })
                        c.push_back ({ rise, strong, mult, stable, legato });

    return c;
}

namespace
{
    /** Normierter Abstand zweier Parametersaetze (fuer den Gleichstand). */
    double distance (const DetectionTuning& a, const DetectionTuning& b)
    {
        return std::abs (std::log (a.minRiseDb / b.minRiseDb))
             + std::abs (std::log (a.strongFluxFactor / b.strongFluxFactor))
             + std::abs (std::log (a.fluxMultiplier / b.fluxMultiplier))
             + std::abs (a.stableFrames - b.stableFrames) * 0.3
             + std::abs (a.legatoFrames - b.legatoFrames) * 0.05;
    }
}

CalibrationResult optimiseTuning (const std::vector<CalibrationTake>& takes, const DetectionTuning& current,
                                  const std::function<bool (float)>& progress)
{
    CalibrationResult r;
    r.current = evaluateTuning (takes, current);
    r.best = r.current;

    const auto candidates = tuningCandidates();
    double bestDistance = 0.0;

    for (size_t i = 0; i < candidates.size(); ++i)
    {
        if (progress && ! progress (static_cast<float> (i) / static_cast<float> (candidates.size())))
            break;

        auto e = evaluateTuning (takes, candidates[i]);
        ++r.combinationsTried;

        const auto dist = distance (candidates[i], current);
        const bool better = e.totalCost < r.best.totalCost - 1e-9
                         || (std::abs (e.totalCost - r.best.totalCost) < 1e-9 && dist < bestDistance);

        if (better)
        {
            r.best = std::move (e);
            bestDistance = dist;
        }
    }

    if (progress)
        progress (1.0f);

    return r;
}

} // namespace ft
