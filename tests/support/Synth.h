#pragma once

#include <vector>

namespace ft::test
{

/** Klangfarbe des synthetischen Zupfinstruments. */
struct Voice
{
    double fundamentalLevel = 1.0;  ///< Pegel des Grundtons relativ zu 1/k (Bass: < 1)
    double brightness       = 1.0;  ///< Teiltonpegel ~ (1/k)^brightness
    double decayPerSec      = 1.5;  ///< Grundabklingrate
    double decayPerHarmonic = 0.4;  ///< zusaetzliche Abklingrate je Teilton
    double inharmonicity    = 1e-4; ///< Saitensteifigkeit B: f_k = k f sqrt(1 + B k^2)
    double attackNoise      = 0.3;  ///< Pegel des Anschlagsgeraeuschs (3 ms)
    double level            = 0.5;
    double noiseFloorDb     = -80.0;
};

struct SynthNote
{
    double startSec = 0.0;
    double hz       = 0.0;
    bool   legato   = false; ///< true: Tonhoehenwechsel ohne neuen Anschlag
    double levelDb  = 0.0;   ///< relativ zu Voice::level (nur bei Anschlag)
};

/** Additive Synthese gezupfter Saiten mit Anschlagstransient, phasenkontinuierlichem
    Legato und Rauschteppich. Deterministisch fuer gleichen seed. */
std::vector<float> renderNotes (const std::vector<SynthNote>& notes, double totalSec,
                                double sampleRate, const Voice& voice = {}, unsigned seed = 1);

std::vector<float> sine (double hz, double sec, double sampleRate, double amplitude = 0.5);

} // namespace ft::test
