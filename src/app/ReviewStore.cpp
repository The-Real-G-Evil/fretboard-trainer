#include "app/ReviewStore.h"

#include "audio/MusicMath.h"
#include "audio/NoteAlignment.h"
#include "audio/OfflineAnalysis.h"
#include "audio/WavFile.h"

#include <cmath>
#include <filesystem>
#include <map>

namespace ft
{

namespace
{
    std::filesystem::path pathOf (const juce::File& f)
    {
       #if JUCE_WINDOWS
        return std::filesystem::path (f.getFullPathName().toWideCharPointer());
       #else
        return std::filesystem::path (f.getFullPathName().toStdString());
       #endif
    }

    const char* verdictName (AlignVerdict v)
    {
        switch (v)
        {
            case AlignVerdict::hit:    return "hit";
            case AlignVerdict::early:  return "early";
            case AlignVerdict::late:   return "late";
            case AlignVerdict::octave: return "octave";
            case AlignVerdict::wrong:  return "wrong";
            case AlignVerdict::missed: break;
        }
        return "missed";
    }

    constexpr int peakBuckets = 3000; // Wellenform: Spitzenwert je Abschnitt
}

ReviewStore::ReviewStore (const juce::File& dataDirectory)
    : directory (dataDirectory.getChildFile ("recordings"))
{
}

ReviewStore::~ReviewStore()
{
    alive->store (false);
    pool.removeAllJobs (true, 20000);
}

juce::File ReviewStore::fileFor (long long sessionId, const char* extension) const
{
    return directory.getChildFile ("session-" + juce::String (sessionId) + extension);
}

void ReviewStore::analyse (const Request& request, std::shared_ptr<const AnalysisWorker::RecordedAudio> audio,
                           const NoiseGate::Parameters& gate, const AnalysisWorker::DetectionConfig& detection, Done done)
{
    if (audio == nullptr || audio->samples.empty() || audio->sampleRate <= 0.0)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("error", "Keine Aufnahme vorhanden");
        done (juce::var (o));
        return;
    }

    // Erwartete Noten in Aufnahme-Zeit (die UI meldet Zeiten auf der Stream-Uhr)
    std::vector<ExpectedItem> expected;
    std::vector<juce::String> live;
    if (const auto* items = request.items.getArray())
        for (const auto& it : *items)
        {
            ExpectedItem e;
            if (const auto* midis = it.getProperty ("midis", {}).getArray())
                for (const auto& m : *midis)
                    e.midis.push_back (static_cast<int> (m));
            const auto t = it.getProperty ("timeMs", {});
            if (! t.isVoid() && ! t.isUndefined())
                e.timeSec = static_cast<double> (t) / 1000.0 - audio->startSec;
            if (! e.midis.empty())
            {
                expected.push_back (std::move (e));
                live.push_back (it.getProperty ("live", "miss").toString());
            }
        }

    directory.createDirectory();
    const auto wavFile = fileFor (request.sessionId, ".wav");
    const auto jsonFile = fileFor (request.sessionId, ".json");
    if (cachedId == request.sessionId)
        cachedId = -1;

    ++busy;
    auto stillAlive = alive;
    pool.addJob ([this, stillAlive, request, audio, gate, detection, expected = std::move (expected),
                  live = std::move (live), wavFile, jsonFile, done = std::move (done)]
    {
        auto* r = new juce::DynamicObject();
        try
        {
            writeWav16 (pathOf (wavFile), audio->samples, audio->sampleRate);

            OfflineOptions o;
            o.minHz = detection.minHz;
            o.maxHz = detection.maxHz;
            o.tuning = detection.tuning;
            o.gate = gate;
            const auto run = analyseOffline (audio->samples, audio->sampleRate, o);

            SegmentationConfig sc;
            sc.sampleRate = audio->sampleRate;
            sc.frameSize = run.frameSize;
            sc.minMidi = static_cast<int> (std::floor (hzToMidi (detection.minHz))) - 1;
            sc.maxMidi = static_cast<int> (std::ceil (hzToMidi (detection.maxHz))) + 1;
            const auto segments = segmentNotes (run.pitches, run.onsets, sc);

            AlignConfig ac;
            ac.toleranceSec = request.toleranceMs / 1000.0;
            const auto alignment = alignNotes (expected, segments, ac);

            // Ergebnis als JSON (auch fuer die Review-Ansicht)
            juce::Array<juce::var> items;
            for (size_t i = 0; i < expected.size(); ++i)
            {
                const auto& a = alignment.items[i];
                auto* item = new juce::DynamicObject();
                juce::Array<juce::var> midis;
                for (const auto m : expected[i].midis)
                    midis.add (m);
                item->setProperty ("midis", midis);
                if (expected[i].timeSec)
                    item->setProperty ("timeSec", *expected[i].timeSec);
                item->setProperty ("live", live[i]);
                item->setProperty ("verdict", verdictName (a.verdict));
                item->setProperty ("segment", a.segment);
                if (a.segment >= 0 && expected[i].timeSec)
                    item->setProperty ("timingErrorMs", a.timingErrorMs);
                items.add (juce::var (item));
            }
            juce::Array<juce::var> segs;
            for (const auto& s : segments)
            {
                auto* seg = new juce::DynamicObject();
                seg->setProperty ("start", s.startSec);
                seg->setProperty ("end", s.endSec);
                seg->setProperty ("midi", s.midi);
                seg->setProperty ("cents", s.cents);
                seg->setProperty ("pick", s.pick);
                segs.add (juce::var (seg));
            }
            juce::Array<juce::var> extra;
            for (const auto e : alignment.extra)
                extra.add (e);

            juce::Array<juce::var> peaks;
            const auto per = std::max<size_t> (1, (audio->samples.size() + peakBuckets - 1) / peakBuckets);
            float maxPeak = 1e-6f;
            std::vector<float> raw;
            for (size_t i = 0; i < audio->samples.size(); i += per)
            {
                float p = 0.0f;
                for (size_t k = i; k < std::min (audio->samples.size(), i + per); ++k)
                    p = std::max (p, std::abs (audio->samples[k]));
                raw.push_back (p);
                maxPeak = std::max (maxPeak, p);
            }
            for (const auto p : raw)
                peaks.add (std::round (p / maxPeak * 1000.0f) / 1000.0f); // auf den lautesten Abschnitt bezogen

            const auto finalTotal = static_cast<int> (expected.size() + alignment.extra.size());
            auto* root = new juce::DynamicObject();
            root->setProperty ("version", 1);
            root->setProperty ("sessionId", request.sessionId);
            root->setProperty ("mode", request.mode);
            root->setProperty ("toleranceMs", request.toleranceMs);
            root->setProperty ("durationSec", static_cast<double> (audio->samples.size()) / audio->sampleRate);
            root->setProperty ("truncated", audio->truncated);
            root->setProperty ("items", items);
            root->setProperty ("segments", segs);
            root->setProperty ("extra", extra);
            root->setProperty ("peaks", peaks);
            root->setProperty ("liveHits", request.liveHits);
            root->setProperty ("liveTotal", request.liveHits + request.liveMisses);
            root->setProperty ("finalHits", alignment.hits);
            root->setProperty ("finalTotal", finalTotal);
            if (! jsonFile.replaceWithText (juce::JSON::toString (juce::var (root), true)))
                throw std::runtime_error ("Ergebnis nicht schreibbar");

            r->setProperty ("sessionId", request.sessionId);
            r->setProperty ("finalHits", alignment.hits);
            r->setProperty ("finalTotal", finalTotal);
            r->setProperty ("liveHits", request.liveHits);
            r->setProperty ("liveTotal", request.liveHits + request.liveMisses);
        }
        catch (const std::exception& ex)
        {
            r->setProperty ("error", juce::String (ex.what()));
        }

        juce::MessageManager::callAsync ([this, stillAlive, done, result = juce::var (r)]
        {
            if (! stillAlive->load())
                return;
            --busy;
            done (result);
        });
    });
}

juce::var ReviewStore::load (long long sessionId) const
{
    const auto f = fileFor (sessionId, ".json");
    return f.existsAsFile() ? juce::JSON::parse (f) : juce::var();
}

std::vector<float> ReviewStore::loadClip (long long sessionId, double fromSec, double toSec, double targetRate)
{
    if (cachedId != sessionId)
    {
        const auto f = fileFor (sessionId, ".wav");
        if (! f.existsAsFile())
            return {};
        auto wav = readWav (pathOf (f));
        cachedSamples = std::move (wav.samples);
        cachedRate = wav.sampleRate;
        cachedId = sessionId;
    }
    if (cachedRate <= 0.0 || targetRate <= 0.0)
        return {};

    const auto total = static_cast<double> (cachedSamples.size()) / cachedRate;
    fromSec = std::clamp (fromSec, 0.0, total);
    toSec = std::clamp (toSec, fromSec, total);
    const auto n = static_cast<size_t> ((toSec - fromSec) * targetRate);
    std::vector<float> out (n);
    // lineare Umrechnung, falls das Geraet inzwischen eine andere Abtastrate hat
    for (size_t i = 0; i < n; ++i)
    {
        const auto pos = (fromSec + static_cast<double> (i) / targetRate) * cachedRate;
        const auto k = static_cast<size_t> (pos);
        const auto frac = static_cast<float> (pos - static_cast<double> (k));
        const auto a = k < cachedSamples.size() ? cachedSamples[k] : 0.0f;
        const auto b = k + 1 < cachedSamples.size() ? cachedSamples[k + 1] : a;
        out[i] = a + (b - a) * frac;
    }
    return out;
}

void ReviewStore::prune (const std::function<bool (long long)>& sessionExists, int maxCount)
{
    std::map<long long, juce::Array<juce::File>, std::greater<>> bySession;
    for (const auto& f : directory.findChildFiles (juce::File::findFiles, false, "session-*"))
    {
        const auto id = f.getFileNameWithoutExtension().fromFirstOccurrenceOf ("session-", false, false).getLargeIntValue();
        if (id > 0)
            bySession[id].add (f);
    }

    int kept = 0;
    for (const auto& [id, files] : bySession)
    {
        if (kept < maxCount && sessionExists (id))
        {
            ++kept;
            continue;
        }
        for (const auto& f : files)
            f.deleteFile();
        if (cachedId == id)
            cachedId = -1;
    }
}

} // namespace ft
