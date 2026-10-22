#include "audio/NoteAlignment.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>

namespace ft
{

namespace
{
    double midiOf (double hz) { return 69.0 + 12.0 * std::log2 (hz / 440.0); }

    /** Kosten eines Tons fuer einen Frame mit geschaetzter Tonhoehe est (Halbtoene). Einzelne Frames
        eine Oktave daneben (typischer Fehler der Tonhoehenschaetzung) kosten wenig mehr. */
    double noteCost (double est, int midi)
    {
        auto base = [] (double d) { return std::min (4.0, 4.0 * d * d); }; // 0,5 Halbtoene daneben: 1
        const auto d = est - midi;
        return std::min ({ base (d), base (d - 12.0) + 1.5, base (d + 12.0) + 1.5 });
    }
}

std::vector<NoteSegment> segmentNotes (const std::vector<Analyzer::PitchFrame>& frames,
                                       const std::vector<double>& onsets, const SegmentationConfig& cfg)
{
    const auto numFrames = static_cast<int> (frames.size());
    if (numFrames == 0)
        return {};

    const auto notes = cfg.maxMidi - cfg.minMidi + 1;
    const auto silence = notes; // letzter Zustand
    const auto states = notes + 1;
    const auto frameSec = cfg.frameSize / cfg.sampleRate;
    const auto hopSec = numFrames > 1 ? frames[1].timeSec - frames[0].timeSec : 256.0 / cfg.sampleRate;

    // Mitte des Analysefensters je Frame; Anschlag "an" einem Frame, wenn das Fenster ihn gerade hinter sich laesst
    auto centre = [&] (int t) { return frames[static_cast<size_t> (t)].timeSec - frameSec * 0.5; };
    std::vector<char> atOnset (static_cast<size_t> (numFrames), 0);
    {
        size_t k = 0;
        for (int t = 0; t < numFrames; ++t)
        {
            const auto end = frames[static_cast<size_t> (t)].timeSec;
            while (k < onsets.size() && onsets[k] < end - frameSec - hopSec)
                ++k;
            atOnset[static_cast<size_t> (t)] = k < onsets.size() && onsets[k] <= end - frameSec + hopSec;
        }
    }

    // Viterbi: Kosten je Zustand, Rueckzeiger je Frame
    std::vector<double> cost (static_cast<size_t> (states), 0.0), next (static_cast<size_t> (states));
    std::vector<std::uint8_t> back (static_cast<size_t> (numFrames) * static_cast<size_t> (states));
    std::vector<double> emit (static_cast<size_t> (states));

    for (int t = 0; t < numFrames; ++t)
    {
        const auto& p = frames[static_cast<size_t> (t)].pitch;
        const bool voiced = p.voiced && p.hz > 0.0f;
        const auto est = voiced ? midiOf (p.hz) : 0.0;
        for (int s = 0; s < notes; ++s)
            emit[static_cast<size_t> (s)] = voiced ? noteCost (est, cfg.minMidi + s) : 1.0; // Aussetzer im Ton: maessig
        emit[static_cast<size_t> (silence)] = voiced ? 3.0 : 0.0;

        auto* bp = back.data() + static_cast<size_t> (t) * static_cast<size_t> (states);
        if (t == 0)
        {
            for (int s = 0; s < states; ++s)
            {
                cost[static_cast<size_t> (s)] = emit[static_cast<size_t> (s)];
                bp[s] = static_cast<std::uint8_t> (s);
            }
            continue;
        }

        // bester Vorgaenger unter den Toenen und die Stille (ein Wechsel kostet unabhaengig vom Ziel gleich viel)
        int bestNote = 0;
        for (int s = 1; s < notes; ++s)
            if (cost[static_cast<size_t> (s)] < cost[static_cast<size_t> (bestNote)])
                bestNote = s;
        const auto onset = atOnset[static_cast<size_t> (t)] != 0;
        const auto change = onset ? cfg.onsetChangePenalty : cfg.changePenalty;
        const auto fromSilence = onset ? cfg.onsetChangePenalty : cfg.silencePenalty;

        for (int s = 0; s < notes; ++s)
        {
            auto best = cost[static_cast<size_t> (s)];
            auto from = s;
            if (const auto c = cost[static_cast<size_t> (bestNote)] + change; bestNote != s && c < best)
            {
                best = c;
                from = bestNote;
            }
            if (const auto c = cost[static_cast<size_t> (silence)] + fromSilence; c < best)
            {
                best = c;
                from = silence;
            }
            next[static_cast<size_t> (s)] = best + emit[static_cast<size_t> (s)];
            bp[s] = static_cast<std::uint8_t> (from);
        }
        {
            auto best = cost[static_cast<size_t> (silence)];
            auto from = silence;
            if (const auto c = cost[static_cast<size_t> (bestNote)] + cfg.silencePenalty; c < best)
            {
                best = c;
                from = bestNote;
            }
            next[static_cast<size_t> (silence)] = best + emit[static_cast<size_t> (silence)];
            bp[silence] = static_cast<std::uint8_t> (from);
        }
        std::swap (cost, next);
    }

    // Rueckverfolgung
    std::vector<int> path (static_cast<size_t> (numFrames));
    path.back() = static_cast<int> (std::min_element (cost.begin(), cost.end()) - cost.begin());
    for (int t = numFrames - 1; t > 0; --t)
        path[static_cast<size_t> (t - 1)] = back[static_cast<size_t> (t) * static_cast<size_t> (states)
                                                 + static_cast<size_t> (path[static_cast<size_t> (t)])];

    // Laeufe gleicher Toene -> Noten; Anschlaege mitten in einer Note teilen sie
    std::vector<NoteSegment> out;
    auto emitRun = [&] (int from, int to, int state)
    {
        NoteSegment seg;
        seg.midi = cfg.minMidi + state;
        const auto first = centre (from);
        // rueckwirkend auf den Anschlag legen, der das Fenster des ersten Frames ausloest
        double start = first - frameSec * 0.5;
        for (const auto o : onsets)
            if (o >= first - frameSec - hopSec && o <= first + hopSec)
            {
                start = o;
                seg.pick = true;
                break;
            }
        seg.startSec = std::max (0.0, start);
        seg.endSec = centre (to) + hopSec * 0.5;

        std::vector<float> cents;
        for (int t = from; t <= to; ++t)
        {
            const auto& p = frames[static_cast<size_t> (t)].pitch;
            if (p.voiced && p.hz > 0.0f)
                if (const auto d = midiOf (p.hz) - seg.midi; std::abs (d) < 0.5)
                    cents.push_back (static_cast<float> (d * 100.0));
        }
        if (! cents.empty())
        {
            std::nth_element (cents.begin(), cents.begin() + static_cast<std::ptrdiff_t> (cents.size() / 2), cents.end());
            seg.cents = cents[cents.size() / 2];
        }
        if (seg.endSec - seg.startSec >= cfg.minNoteSec)
            out.push_back (seg);
    };

    int runStart = 0;
    for (int t = 1; t <= numFrames; ++t)
    {
        const auto ended = t == numFrames || path[static_cast<size_t> (t)] != path[static_cast<size_t> (runStart)];
        // gleicher Ton erneut angeschlagen: Anschlag mitten im Lauf (nicht direkt am Anfang)
        const auto restruck = ! ended && atOnset[static_cast<size_t> (t)] && ! atOnset[static_cast<size_t> (t - 1)]
                              && centre (t) - centre (runStart) > frameSec;
        if (! ended && ! restruck)
            continue;
        if (path[static_cast<size_t> (runStart)] != silence)
            emitRun (runStart, t - 1, path[static_cast<size_t> (runStart)]);
        runStart = t;
    }
    return out;
}

Alignment alignNotes (const std::vector<ExpectedItem>& expected, const std::vector<NoteSegment>& segments,
                      const AlignConfig& cfg)
{
    const auto n = expected.size();
    const auto m = segments.size();
    const auto timed = cfg.toleranceSec > 0.0;

    constexpr double missCost = 1.0;
    auto extraCost = [&] (size_t j)
    {
        const auto& s = segments[j];
        // kurze Noten ohne Anschlag sind eher Artefakte (Umgreifen, Ausklingen) als Fehlversuche
        return s.pick && s.endSec - s.startSec >= 0.06 ? 0.8 : 0.2;
    };
    auto pitchCost = [&] (size_t i, size_t j)
    {
        const auto midi = segments[j].midi;
        const auto& want = expected[i].midis;
        if (std::find (want.begin(), want.end(), midi) != want.end())
            return 0.0;
        for (const auto w : want)
            if ((midi - w) % 12 == 0)
                return 0.6;
        return 1.0;
    };
    auto timeCost = [&] (size_t i, size_t j)
    {
        if (! timed || ! expected[i].timeSec)
            return 0.0;
        const auto dt = std::abs (segments[j].startSec - *expected[i].timeSec);
        return std::clamp ((dt - cfg.toleranceSec) / (4.0 * cfg.toleranceSec), 0.0, 1.0) * 1.5;
    };

    // D[i][j]: beste Kosten fuer die ersten i erwarteten und j erkannten Noten
    std::vector<double> d ((n + 1) * (m + 1), 0.0);
    std::vector<std::uint8_t> step ((n + 1) * (m + 1), 0); // 0 Paar, 1 erwartet verpasst, 2 zusaetzlich gespielt
    auto at = [&] (size_t i, size_t j) -> size_t { return i * (m + 1) + j; };
    for (size_t i = 1; i <= n; ++i)
    {
        d[at (i, 0)] = d[at (i - 1, 0)] + missCost;
        step[at (i, 0)] = 1;
    }
    for (size_t j = 1; j <= m; ++j)
    {
        d[at (0, j)] = d[at (0, j - 1)] + extraCost (j - 1);
        step[at (0, j)] = 2;
    }
    for (size_t i = 1; i <= n; ++i)
        for (size_t j = 1; j <= m; ++j)
        {
            auto best = d[at (i - 1, j - 1)] + pitchCost (i - 1, j - 1) + timeCost (i - 1, j - 1);
            std::uint8_t how = 0;
            if (const auto c = d[at (i - 1, j)] + missCost; c < best)
            {
                best = c;
                how = 1;
            }
            if (const auto c = d[at (i, j - 1)] + extraCost (j - 1); c < best)
            {
                best = c;
                how = 2;
            }
            d[at (i, j)] = best;
            step[at (i, j)] = how;
        }

    Alignment result;
    result.items.resize (n);
    std::vector<int> extra;
    for (size_t i = n, j = m; i > 0 || j > 0;)
    {
        const auto how = step[at (i, j)];
        if (how == 0)
        {
            auto& item = result.items[i - 1];
            item.segment = static_cast<int> (j - 1);
            const auto pc = pitchCost (i - 1, j - 1);
            item.verdict = pc == 0.0 ? AlignVerdict::hit : pc < 1.0 ? AlignVerdict::octave : AlignVerdict::wrong;
            if (expected[i - 1].timeSec)
            {
                const auto dt = segments[j - 1].startSec - *expected[i - 1].timeSec;
                item.timingErrorMs = dt * 1000.0;
                if (timed && item.verdict == AlignVerdict::hit && std::abs (dt) > cfg.toleranceSec)
                    item.verdict = dt < 0.0 ? AlignVerdict::early : AlignVerdict::late;
            }
            --i;
            --j;
        }
        else if (how == 1)
        {
            result.items[i - 1] = {};
            --i;
        }
        else
        {
            if (extraCost (j - 1) >= 0.8)
                extra.push_back (static_cast<int> (j - 1));
            --j;
        }
    }
    std::reverse (extra.begin(), extra.end());
    result.extra = std::move (extra);
    for (const auto& item : result.items)
        if (item.verdict == AlignVerdict::hit)
            ++result.hits;
    return result;
}

} // namespace ft
