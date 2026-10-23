#pragma once

namespace ft
{

/** Einschub in den Mithoer-Weg nach den eigenen Effekten (z. B. VST3-Plugins).

    prepareInsert() kommt vor dem ersten process und bei jedem Neustart des Geraets (nicht im
    Audio-Thread, waehrend kein Audio laeuft). processInsert() laeuft im Audio-Thread und darf nicht
    blockieren. */
class AudioInsert
{
public:
    virtual ~AudioInsert() = default;
    virtual void prepareInsert (double sampleRate, int maxBlockSize) = 0;
    virtual void processInsert (float* left, float* right, int numSamples) noexcept = 0;
};

} // namespace ft
