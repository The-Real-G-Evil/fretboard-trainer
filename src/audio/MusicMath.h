#pragma once

#include <array>
#include <cmath>
#include <string>

namespace ft
{

/** Frequenz -> MIDI-Notennummer als Gleitkommazahl (A4 = 69 = 440 Hz). */
inline double hzToMidi (double hz, double a4 = 440.0) noexcept
{
    return 69.0 + 12.0 * std::log2 (hz / a4);
}

inline double midiToHz (double midi, double a4 = 440.0) noexcept
{
    return a4 * std::pow (2.0, (midi - 69.0) / 12.0);
}

/** Naechste Note und Abweichung in Cent (-50 .. +50). */
struct NearestNote
{
    int   midi  = 0;
    float cents = 0.0f;
};

inline NearestNote nearestNote (double hz, double a4 = 440.0) noexcept
{
    const auto m = hzToMidi (hz, a4);
    const auto rounded = std::lround (m);
    return { static_cast<int> (rounded), static_cast<float> ((m - static_cast<double> (rounded)) * 100.0) };
}

/** Wissenschaftliche Notation mit Kreuz, z. B. 40 -> "E2", 61 -> "C#4". */
inline std::string midiToName (int midi)
{
    static constexpr std::array<const char*, 12> names { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
    const auto pc = ((midi % 12) + 12) % 12;
    const auto octave = (midi - pc) / 12 - 1;
    return std::string (names[static_cast<size_t> (pc)]) + std::to_string (octave);
}

} // namespace ft
