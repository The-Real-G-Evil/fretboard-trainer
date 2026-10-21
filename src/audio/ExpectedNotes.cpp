#include "audio/ExpectedNotes.h"

#include <fstream>
#include <sstream>
#include <stdexcept>

namespace ft
{

ExpectedNotes readExpectedNotes (const std::filesystem::path& path)
{
    std::ifstream f (path);
    if (! f)
        throw std::runtime_error ("Erwartungsdatei nicht lesbar: " + path.string());

    ExpectedNotes data;
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
        s >> type;

        if (type != "pick" && type != "legato")
            throw std::runtime_error ("Unbekannter Anschlagstyp '" + type + "' in " + path.string());

        n.type = type == "pick" ? OnsetType::pick : OnsetType::legato;

        if (double t; s >> t)
            n.timeSec = t;

        data.notes.push_back (n);
    }

    return data;
}

void writeExpectedNotes (const std::filesystem::path& path, const ExpectedNotes& data)
{
    std::ofstream f (path);
    if (! f)
        throw std::runtime_error ("Erwartungsdatei nicht schreibbar: " + path.string());

    f << "# Erwartete Noten: midi typ [zeit_s]\n";
    f << "range " << data.minHz << " " << data.maxHz << "\n";
    for (const auto& n : data.notes)
    {
        f << n.midi << " " << (n.type == OnsetType::pick ? "pick" : "legato");
        if (n.timeSec)
            f << " " << *n.timeSec;
        f << "\n";
    }
}

} // namespace ft
