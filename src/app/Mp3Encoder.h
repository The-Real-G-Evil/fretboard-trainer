#pragma once

#include <juce_audio_formats/juce_audio_formats.h>

namespace ft
{

/** MP3 unter Windows ueber den Encoder von Windows (Media Foundation, ab Windows 8 enthalten):
    der kann nur 32, 44,1 und 48 kHz, andere Abtastraten werden vorher auf 48 kHz umgerechnet;
    geschrieben wird immer stereo (Mono auf beide Kanaele). Unter Linux und macOS ueber LAME
    (mitgebaut, siehe cmake/Lame.cmake), Mono bleibt dort Mono.

    Liefert einen leeren String bei Erfolg, sonst die Fehlermeldung. */
juce::String encodeMp3 (juce::AudioFormatReader& source, const juce::File& target, int kbps);

} // namespace ft
