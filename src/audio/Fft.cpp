#include "audio/Fft.h"

#include <cassert>
#include <numbers>
#include <utility>

namespace ft
{

int Fft::nextPowerOfTwo (int n) noexcept
{
    int p = 1;
    while (p < n)
        p <<= 1;
    return p;
}

void Fft::prepare (int newSize)
{
    assert (newSize >= 2 && (newSize & (newSize - 1)) == 0);
    size = newSize;

    int bits = 0;
    while ((1 << bits) < size)
        ++bits;

    bitReversed.resize (static_cast<size_t> (size));
    for (int i = 0; i < size; ++i)
    {
        int r = 0;
        for (int b = 0; b < bits; ++b)
            if (i & (1 << b))
                r |= 1 << (bits - 1 - b);
        bitReversed[static_cast<size_t> (i)] = r;
    }

    twiddles.resize (static_cast<size_t> (size / 2));
    for (int k = 0; k < size / 2; ++k)
    {
        const auto angle = -2.0 * std::numbers::pi * k / size;
        twiddles[static_cast<size_t> (k)] = { static_cast<float> (std::cos (angle)), static_cast<float> (std::sin (angle)) };
    }
}

void Fft::forward (std::complex<float>* data) const noexcept
{
    transform (data, false);
}

void Fft::inverse (std::complex<float>* data) const noexcept
{
    transform (data, true);

    const auto scale = 1.0f / static_cast<float> (size);
    for (int i = 0; i < size; ++i)
        data[i] *= scale;
}

void Fft::transform (std::complex<float>* data, bool inv) const noexcept
{
    for (int i = 0; i < size; ++i)
    {
        const auto j = bitReversed[static_cast<size_t> (i)];
        if (i < j)
            std::swap (data[i], data[j]);
    }

    for (int len = 2; len <= size; len <<= 1)
    {
        const int half = len / 2;
        const int step = size / len;

        for (int start = 0; start < size; start += len)
        {
            for (int k = 0; k < half; ++k)
            {
                auto w = twiddles[static_cast<size_t> (k * step)];
                if (inv)
                    w = std::conj (w);

                const auto a = data[start + k];
                const auto b = data[start + k + half] * w;
                data[start + k]        = a + b;
                data[start + k + half] = a - b;
            }
        }
    }
}

} // namespace ft
