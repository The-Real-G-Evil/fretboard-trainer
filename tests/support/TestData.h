#pragma once

#include "audio/NoteTracker.h"

#include <string>
#include <vector>

namespace ft::test
{

/** Erwartete Noten zu einer Test-WAV (Datei <name>.txt neben <name>.wav).

    Format:
        range <minHz> <maxHz>
        <midi> <pick|legato> <zeit in s>
        ...
    Leerzeilen und Zeilen mit '#' werden ignoriert.
*/
struct ExpectedNote
{
    int midi = 0;
    OnsetType type = OnsetType::pick;
    double timeSec = 0.0;
};

struct TestCaseData
{
    float minHz = 55.0f;
    float maxHz = 1500.0f;
    std::vector<ExpectedNote> notes;
};

TestCaseData readExpected (const std::string& path);
void writeExpected (const std::string& path, const TestCaseData& data);

} // namespace ft::test
