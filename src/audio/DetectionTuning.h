#pragma once

namespace ft
{

/** Per Kalibrierung einstellbare Entscheidungsparameter der Erkennung.
    Die Standardwerte sind an synthetischen Signalen ermittelt (siehe tests/). */
struct DetectionTuning
{
    float minRiseDb        = 3.0f; ///< Huellkurvenanstieg fuer einen Anschlag
    float strongFluxFactor = 10.0f; ///< Fluss-Vielfaches fuer Anschlag ohne Pegelanstieg
    float fluxMultiplier   = 1.5f; ///< gleitende Fluss-Schwelle = Mittelwert * Faktor + Delta
    int   stableFrames     = 3;    ///< so viele Frames muss eine Tonhoehe stabil sein
    int   legatoFrames     = 12;   ///< so lange (Frames a ~5 ms) muss ein Legato-Ton ohne Anschlag stehen

    bool operator== (const DetectionTuning&) const = default;
};

} // namespace ft
