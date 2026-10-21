#pragma once

#include "audio/OfflineAnalysis.h"

#include <vector>

namespace ft::test
{

/** Kurzform von analyseOffline() fuer Tests. */
inline AnalysisRun analyse (const std::vector<float>& signal, double sampleRate,
                            float minHz = 55.0f, float maxHz = 1500.0f, int blockSize = 128,
                            float gateThresholdDb = -50.0f, const DetectionTuning& tuning = {})
{
    OfflineOptions o;
    o.minHz = minHz;
    o.maxHz = maxHz;
    o.blockSize = blockSize;
    o.gate.thresholdDb = gateThresholdDb;
    o.tuning = tuning;
    return analyseOffline (signal, sampleRate, o);
}

} // namespace ft::test
