#pragma once

#include "audio/NoteTracker.h"

#include <filesystem>
#include <optional>
#include <vector>

namespace ft
{

/** Erwartete Notenfolge zu einer Aufnahme (Datei <name>.txt neben <name>.wav).

    Format:
        range <minHz> <maxHz>
        <midi> <pick|legato> [<zeit in s>]
        ...
    Leerzeilen und alles ab '#' werden ignoriert. Ohne Zeitangabe wird nur die
    Reihenfolge geprueft (z. B. bei Kalibrier-Aufnahmen ohne Metronom).
*/
struct ExpectedNote
{
    int midi = 0;
    OnsetType type = OnsetType::pick;
    std::optional<double> timeSec;
};

struct ExpectedNotes
{
    float minHz = 55.0f;
    float maxHz = 1500.0f;
    std::vector<ExpectedNote> notes;
};

/** Wirft std::runtime_error. */
ExpectedNotes readExpectedNotes (const std::filesystem::path& path);
void writeExpectedNotes (const std::filesystem::path& path, const ExpectedNotes& data);

} // namespace ft
