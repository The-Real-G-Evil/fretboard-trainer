#include "TestData.h"

#include <fstream>
#include <sstream>
#include <stdexcept>

namespace ft::test
{

TestCaseData readExpected (const std::string& path)
{
    std::ifstream f (path);
    if (! f)
        throw std::runtime_error ("Erwartungsdatei nicht lesbar: " + path);

    TestCaseData data;
    std::string line;

    while (std::getline (f, line))
    {
        if (const auto hash = line.find ('#'); hash != std::string::npos)
            line.erase (hash);

        std::istringstream s (line);
        std::string first;
        if (! (s >> first))
            continue;

        if (first == "range")
        {
            s >> data.minHz >> data.maxHz;
            continue;
        }

        ExpectedNote n;
        std::string type;
        n.midi = std::stoi (first);
        s >> type >> n.timeSec;

        if (type != "pick" && type != "legato")
            throw std::runtime_error ("Unbekannter Anschlagstyp '" + type + "' in " + path);

        n.type = type == "pick" ? OnsetType::pick : OnsetType::legato;
        data.notes.push_back (n);
    }

    return data;
}

void writeExpected (const std::string& path, const TestCaseData& data)
{
    std::ofstream f (path);
    if (! f)
        throw std::runtime_error ("Erwartungsdatei nicht schreibbar: " + path);

    f << "# Erwartete Noten: midi typ zeit_s\n";
    f << "range " << data.minHz << " " << data.maxHz << "\n";
    for (const auto& n : data.notes)
        f << n.midi << " " << (n.type == OnsetType::pick ? "pick" : "legato") << " " << n.timeSec << "\n";
}

} // namespace ft::test
