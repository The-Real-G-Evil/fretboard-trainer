#pragma once

#include <complex>
#include <vector>

namespace ft
{

/** Iterative Radix-2-FFT (komplex, in-place). Groesse muss eine Zweierpotenz sein.
    prepare() alloziert; forward()/inverse() nicht.
*/
class Fft
{
public:
    void prepare (int size);
    int getSize() const noexcept { return size; }

    void forward (std::complex<float>* data) const noexcept;
    /** Inverse FFT inklusive Normierung mit 1/N. */
    void inverse (std::complex<float>* data) const noexcept;

    static int nextPowerOfTwo (int n) noexcept;

private:
    void transform (std::complex<float>* data, bool inverse) const noexcept;

    int size = 0;
    std::vector<int> bitReversed;
    std::vector<std::complex<float>> twiddles;
};

} // namespace ft
