#pragma once

#include <array>
#include <atomic>
#include <cstddef>

namespace ft
{

/** Lock-freier Ringpuffer fuer genau einen Schreiber und einen Leser.
    Kapazitaet ist Capacity - 1 Elemente. Keine Allokationen nach der Konstruktion.
*/
#if defined (_MSC_VER)
 #pragma warning (push)
 #pragma warning (disable: 4324) // Auffuellung durch alignas ist hier gewollt (False Sharing vermeiden)
#endif

template <typename T, std::size_t Capacity>
class SpscFifo
{
    static_assert (Capacity >= 2, "Capacity muss mindestens 2 sein");

public:
    /** Vom Schreiber aufzurufen. Liefert false, wenn der Puffer voll ist. */
    bool push (const T& item) noexcept
    {
        const auto w = writeIndex.load (std::memory_order_relaxed);
        const auto next = increment (w);

        if (next == readIndex.load (std::memory_order_acquire))
            return false;

        buffer[w] = item;
        writeIndex.store (next, std::memory_order_release);
        return true;
    }

    /** Vom Leser aufzurufen. Liefert false, wenn der Puffer leer ist. */
    bool pop (T& item) noexcept
    {
        const auto r = readIndex.load (std::memory_order_relaxed);

        if (r == writeIndex.load (std::memory_order_acquire))
            return false;

        item = buffer[r];
        readIndex.store (increment (r), std::memory_order_release);
        return true;
    }

private:
    static constexpr std::size_t increment (std::size_t i) noexcept { return (i + 1) % Capacity; }

    std::array<T, Capacity> buffer {};
    alignas (64) std::atomic<std::size_t> writeIndex { 0 };
    alignas (64) std::atomic<std::size_t> readIndex  { 0 };
};

#if defined (_MSC_VER)
 #pragma warning (pop)
#endif

} // namespace ft
