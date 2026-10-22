#pragma once

#include <algorithm>
#include <atomic>
#include <memory>
#include <vector>

namespace ft
{

/** Spielt einen Ausschnitt einer Aufnahme ueber den Ausgang (Review: Stellen anhoeren).

    UI-Thread: play()/stop(). Audio-Thread: process() mischt in den Ausgangsbus.
    Uebergabe lock-frei: der UI-Thread legt einen neuen Ausschnitt in `pending`, der Audio-Thread
    uebernimmt ihn und gibt den alten ueber `retired` zum Loeschen zurueck. */
class ClipPlayer
{
public:
    ~ClipPlayer()
    {
        delete pending.exchange (nullptr);
        delete retired.exchange (nullptr);
        delete current;
    }

    /** Samples muessen in der Abtastrate des Geraets vorliegen. Ersetzt einen laufenden Ausschnitt. */
    void play (std::vector<float> samples, float gain = 1.0f)
    {
        delete retired.exchange (nullptr);
        delete pending.exchange (new Clip { std::move (samples), gain });
    }

    void stop() { play ({}); }

    /** UI-Thread: laeuft gerade ein Ausschnitt? */
    bool isPlaying() const noexcept { return playing.load (std::memory_order_relaxed); }

    /** Audio-Thread. */
    void process (float* out, int n) noexcept
    {
        if (retired.load (std::memory_order_acquire) == nullptr)
            if (auto* c = pending.exchange (nullptr, std::memory_order_acq_rel))
            {
                retired.store (current, std::memory_order_release);
                current = c;
                position = 0;
            }

        if (current == nullptr || position >= current->samples.size())
        {
            playing.store (false, std::memory_order_relaxed);
            return;
        }

        playing.store (true, std::memory_order_relaxed);
        const auto& s = current->samples;
        for (int i = 0; i < n && position < s.size(); ++i, ++position)
        {
            // 5 ms Ein- und Ausblenden gegen Knacken
            const auto fade = std::min ({ 1.0f, static_cast<float> (position) / 240.0f,
                                          static_cast<float> (s.size() - position) / 240.0f });
            out[i] += s[position] * current->gain * fade;
        }
    }

private:
    struct Clip
    {
        std::vector<float> samples;
        float gain = 1.0f;
    };

    std::atomic<Clip*> pending { nullptr }, retired { nullptr };
    Clip* current = nullptr; // nur Audio-Thread
    size_t position = 0;
    std::atomic<bool> playing { false };
};

} // namespace ft
