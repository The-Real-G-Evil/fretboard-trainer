#include "app/CalibrationStore.h"

#include "audio/LevelMeter.h"
#include "audio/WavFile.h"

#include <algorithm>

namespace ft
{

namespace
{
    std::filesystem::path toPath (const juce::File& f)
    {
       #if JUCE_WINDOWS
        return std::filesystem::path (f.getFullPathName().toWideCharPointer());
       #else
        return std::filesystem::path (f.getFullPathName().toStdString());
       #endif
    }

    juce::String gateKey (const NoiseGate::Parameters& g)
    {
        return juce::String (g.thresholdDb) + "/" + juce::String (g.attackMs) + "/" + juce::String (g.holdMs)
             + "/" + juce::String (g.releaseMs) + "/" + juce::String (g.hysteresisDb);
    }

    const char* kindName (AlignKind k)
    {
        switch (k)
        {
            case AlignKind::correct:    return "correct";
            case AlignKind::wrongType:  return "wrongType";
            case AlignKind::wrongPitch: return "wrongPitch";
            case AlignKind::missing:    return "missing";
            case AlignKind::extra:      return "extra";
        }
        return "";
    }

    const char* typeName (OnsetType t) { return t == OnsetType::pick ? "pick" : "legato"; }

    juce::var toVar (const TakeScore& s, const std::vector<NoteEvent>& detected)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("accuracy", s.accuracy);
        o->setProperty ("expected", s.expected);
        o->setProperty ("correct", s.correct);
        o->setProperty ("wrongType", s.wrongType);
        o->setProperty ("wrongPitch", s.wrongPitch);
        o->setProperty ("missing", s.missing);
        o->setProperty ("extra", s.extra);

        juce::Array<juce::var> alignment;
        for (const auto& a : s.alignment)
        {
            auto* e = new juce::DynamicObject();
            e->setProperty ("kind", kindName (a.kind));
            e->setProperty ("expected", a.expectedIndex);
            e->setProperty ("detected", a.detectedIndex);
            alignment.add (juce::var (e));
        }
        o->setProperty ("alignment", alignment);

        juce::Array<juce::var> notes;
        for (const auto& n : detected)
        {
            auto* e = new juce::DynamicObject();
            e->setProperty ("midi", n.midi);
            e->setProperty ("cents", n.cents);
            e->setProperty ("timeMs", n.timeSec * 1000.0);
            e->setProperty ("onsetType", typeName (n.onsetType));
            notes.add (juce::var (e));
        }
        o->setProperty ("detected", notes);
        return juce::var (o);
    }

    juce::var toVar (const NoiseProfile& p)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("peakDb", p.peakDb);
        o->setProperty ("typicalPeakDb", p.typicalPeakDb);
        o->setProperty ("rmsDb", p.rmsDb);
        o->setProperty ("suggestedGateDb", p.suggestedGateDb);
        o->setProperty ("quiet", p.quiet);
        return juce::var (o);
    }

    juce::var toVar (const DetectionTuning& t)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("minRiseDb", t.minRiseDb);
        o->setProperty ("strongFluxFactor", t.strongFluxFactor);
        o->setProperty ("fluxMultiplier", t.fluxMultiplier);
        o->setProperty ("stableFrames", t.stableFrames);
        o->setProperty ("legatoFrames", t.legatoFrames);
        return juce::var (o);
    }

    juce::var errorVar (const juce::String& message)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("error", message);
        return juce::var (o);
    }

    ExpectedNotes expectedFromVar (const juce::var& take)
    {
        ExpectedNotes e;
        e.minHz = static_cast<float> (static_cast<double> (take.getProperty ("minHz", 55.0)));
        e.maxHz = static_cast<float> (static_cast<double> (take.getProperty ("maxHz", 1500.0)));

        if (const auto* arr = take.getProperty ("expected", {}).getArray())
            for (const auto& n : *arr)
                e.notes.push_back ({ static_cast<int> (n.getProperty ("midi", 0)),
                                     n.getProperty ("type", "pick").toString() == "legato" ? OnsetType::legato : OnsetType::pick,
                                     std::nullopt });
        return e;
    }
}

//==============================================================================
CalibrationStore::CalibrationStore (const juce::File& dataDirectory)
    : directory (dataDirectory.getChildFile ("calibration"))
{
    directory.createDirectory();
    loadIndex();
}

CalibrationStore::~CalibrationStore()
{
    alive->store (false);
    pool.removeAllJobs (true, 10000);
}

juce::File CalibrationStore::fileFor (const juce::String& id, const char* extension) const
{
    return directory.getChildFile (id + extension);
}

void CalibrationStore::loadIndex()
{
    // Uebernahme aus der frueheren Ablage mit gemeinsamer Indexdatei
    const auto legacy = directory.getChildFile ("takes.json");
    if (legacy.existsAsFile())
    {
        const auto parsed = juce::JSON::parse (legacy); // muss leben, solange arr benutzt wird
        if (const auto* arr = parsed.getArray())
            for (const auto& take : *arr)
                if (! fileFor (take.getProperty ("id", {}).toString(), ".json").existsAsFile())
                    saveEntry (take);
        legacy.deleteFile();
    }

    restoreMissingEntries();

    juce::Array<juce::var> takes;
    for (const auto& f : directory.findChildFiles (juce::File::findFiles, false, "*.json"))
    {
        const auto take = juce::JSON::parse (f);
        if (take.isObject() && take.getProperty ("id", {}).toString() == f.getFileNameWithoutExtension())
            takes.add (take);
    }

    std::sort (takes.begin(), takes.end(), [] (const juce::var& a, const juce::var& b)
    {
        return a.getProperty ("createdAt", {}).toString() < b.getProperty ("createdAt", {}).toString();
    });

    index = takes;
}

// Die Erwartungsdatei (.txt) traegt eine Kopie des Eintrags als Kommentarzeile. Fehlt die .json einer
// Aufnahme (geloescht, verloren, nicht mitkopiert), entsteht sie daraus neu; die Bewertung folgt beim
// naechsten evaluateAll().
namespace
{
    const juce::String entryComment = "# eintrag ";
}

void CalibrationStore::restoreMissingEntries()
{
    for (const auto& wav : directory.findChildFiles (juce::File::findFiles, false, "*.wav"))
    {
        const auto id = wav.getFileNameWithoutExtension();
        if (fileFor (id, ".json").existsAsFile())
            continue;

        juce::StringArray lines;
        fileFor (id, ".txt").readLines (lines);
        for (const auto& line : lines)
        {
            if (! line.startsWith (entryComment))
                continue;
            const auto take = juce::JSON::parse (line.substring (entryComment.length()));
            if (take.isObject() && take.getProperty ("id", {}).toString() == id)
                saveEntry (take);
            break;
        }
    }
}

bool CalibrationStore::saveEntry (const juce::var& take) const
{
    return fileFor (take.getProperty ("id", {}).toString(), ".json").replaceWithText (juce::JSON::toString (take));
}

void CalibrationStore::runInBackground (std::function<std::function<void()> ()> work)
{
    ++busy;
    auto stillAlive = alive;

    pool.addJob ([this, stillAlive, work = std::move (work)]
    {
        auto continuation = work();

        juce::MessageManager::callAsync ([this, stillAlive, continuation = std::move (continuation)]
        {
            if (! stillAlive->load())
                return;

            --busy;
            if (continuation)
                continuation();
        });
    });
}

const CalibrationTake* CalibrationStore::getAnalysedTake (const juce::String& id, const ExpectedNotes& expected,
                                                          const NoiseGate::Parameters& gate)
{
    const auto key = gateKey (gate);
    if (key != cachedGateKey)
    {
        cache.clear();
        cachedGateKey = key;
    }

    if (auto it = cache.find (id); it != cache.end())
        return &it->second;

    const auto wav = readWav (toPath (fileFor (id, ".wav")));
    return &cache.emplace (id, makeCalibrationTake (wav.samples, wav.sampleRate, expected, gate)).first->second;
}

//==============================================================================
void CalibrationStore::addTake (const TakeInfo& info, AnalysisWorker::RecordedAudio audio,
                                const NoiseGate::Parameters& gate, const DetectionTuning& tuning, Done done)
{
    const auto now = juce::Time::getCurrentTime();
    const auto id = now.formatted ("%Y%m%d-%H%M%S-") + juce::String (juce::Random::getSystemRandom().nextInt (10000)).paddedLeft ('0', 4);

    auto* entry = new juce::DynamicObject();
    entry->setProperty ("id", id);
    entry->setProperty ("instrument", info.instrument);
    entry->setProperty ("exerciseId", info.exerciseId);
    entry->setProperty ("title", info.title);
    entry->setProperty ("kind", info.kind);
    entry->setProperty ("level", info.level);
    entry->setProperty ("createdAt", now.toISO8601 (true));
    entry->setProperty ("sampleRate", audio.sampleRate);
    entry->setProperty ("durationSec", audio.sampleRate > 0.0 ? static_cast<double> (audio.samples.size()) / audio.sampleRate : 0.0);
    entry->setProperty ("minHz", info.expected.minHz);
    entry->setProperty ("maxHz", info.expected.maxHz);

    juce::Array<juce::var> expected;
    for (const auto& n : info.expected.notes)
    {
        auto* e = new juce::DynamicObject();
        e->setProperty ("midi", n.midi);
        e->setProperty ("type", typeName (n.type));
        expected.add (juce::var (e));
    }
    entry->setProperty ("expected", expected);

    juce::var entryVar (entry);
    const auto wavFile = fileFor (id, ".wav");
    const auto txtFile = fileFor (id, ".txt");

    runInBackground ([this, entryVar, info, audio = std::move (audio), gate, tuning, wavFile, txtFile, id, done]() -> std::function<void()>
    {
        try
        {
            if (audio.samples.empty() || audio.sampleRate <= 0.0)
                throw std::runtime_error ("Die Aufnahme ist leer.");

            writeWavFloat (toPath (wavFile), audio.samples, audio.sampleRate);

            float peak = 0.0f;
            for (auto x : audio.samples)
                peak = std::max (peak, std::abs (x));
            entryVar.getDynamicObject()->setProperty ("peakDb", gainToDb (peak));

            if (info.kind == "silence")
            {
                entryVar.getDynamicObject()->setProperty ("noise", toVar (measureNoise (audio.samples, audio.sampleRate)));
            }
            else
            {
                writeExpectedNotes (toPath (txtFile), info.expected);
                txtFile.appendText (entryComment + juce::JSON::toString (entryVar, true) + "\n");
                const auto* take = getAnalysedTake (id, info.expected, gate);
                const auto out = Analyzer::replay (take->recording, tuning);
                entryVar.getDynamicObject()->setProperty ("score", toVar (scoreTake (info.expected.notes, out.notes), out.notes));
            }

            if (! saveEntry (entryVar))
                throw std::runtime_error ("Die Aufnahme konnte nicht gespeichert werden (" + toPath (fileFor (id, ".json")).string() + ").");
        }
        catch (const std::exception& e)
        {
            const auto message = juce::String (e.what());
            return [done, message] { done (errorVar (message)); };
        }

        return [this, entryVar, done]
        {
            index.append (entryVar);
            done (entryVar);
        };
    });
}

bool CalibrationStore::removeTake (const juce::String& id)
{
    auto* arr = index.getArray();
    if (arr == nullptr)
        return false;

    for (int i = 0; i < arr->size(); ++i)
    {
        if (arr->getReference (i).getProperty ("id", {}).toString() == id)
        {
            arr->remove (i);
            fileFor (id, ".json").deleteFile();
            fileFor (id, ".wav").deleteFile();
            fileFor (id, ".txt").deleteFile();
            runInBackground ([this, id]() -> std::function<void()> { cache.erase (id); return {}; });
            return true;
        }
    }

    return false;
}

void CalibrationStore::evaluateAll (const juce::String& instrument, const NoiseGate::Parameters& gate,
                                    const DetectionTuning& tuning, Done done)
{
    auto snapshot = juce::JSON::parse (juce::JSON::toString (index)); // tiefe Kopie fuer den Hintergrund-Thread

    runInBackground ([this, snapshot, instrument, gate, tuning, done]() -> std::function<void()>
    {
        if (auto* arr = snapshot.getArray())
        {
            for (auto& take : *arr)
            {
                if (take.getProperty ("kind", "notes").toString() != "notes"
                    || take.getProperty ("instrument", {}).toString() != instrument)
                    continue;

                try
                {
                    const auto expected = expectedFromVar (take);
                    const auto* t = getAnalysedTake (take.getProperty ("id", {}).toString(), expected, gate);
                    const auto out = Analyzer::replay (t->recording, tuning);
                    const auto score = toVar (scoreTake (expected.notes, out.notes), out.notes);
                    // nur bei geaenderter Bewertung schreiben: beim Start nicht jede Datei neu anlegen
                    // (Vergleich nach JSON-Hin-und-Rueck, wie die gespeicherte Bewertung gelesen wurde)
                    const auto asStored = [] (const juce::var& v) { return juce::JSON::toString (juce::JSON::parse (juce::JSON::toString (v, true)), true); };
                    if (asStored (score) != asStored (take.getProperty ("score", {})))
                    {
                        take.getDynamicObject()->setProperty ("score", score);
                        saveEntry (take);
                    }
                }
                catch (const std::exception&)
                {
                    take.getDynamicObject()->setProperty ("missingFile", true);
                }
            }
        }

        return [this, snapshot, done]
        {
            // Nur die neuen Bewertungen uebernehmen: inzwischen hinzugekommene oder geloeschte
            // Aufnahmen sollen nicht durch den alten Stand ueberschrieben werden
            if (auto* current = index.getArray())
                if (const auto* updated = snapshot.getArray())
                    for (auto& take : *current)
                        for (const auto& u : *updated)
                            if (u.getProperty ("id", {}) == take.getProperty ("id", {}))
                                if (auto* obj = take.getDynamicObject())
                                {
                                    obj->setProperty ("score", u.getProperty ("score", {}));
                                    if (u.hasProperty ("missingFile"))
                                        obj->setProperty ("missingFile", true);
                                }

            done (index);
        };
    });
}

void CalibrationStore::optimise (const juce::String& instrument, const NoiseGate::Parameters& gate,
                                 const DetectionTuning& current, Progress progress, Done done)
{
    auto snapshot = juce::JSON::parse (juce::JSON::toString (index));
    auto stillAlive = alive;

    runInBackground ([this, snapshot, instrument, gate, current, progress, done, stillAlive]() -> std::function<void()>
    {
        std::vector<CalibrationTake> takes;
        juce::StringArray ids;

        if (auto* arr = snapshot.getArray())
        {
            for (const auto& take : *arr)
            {
                if (take.getProperty ("kind", "notes").toString() != "notes"
                    || take.getProperty ("instrument", {}).toString() != instrument)
                    continue;

                try
                {
                    const auto id = take.getProperty ("id", {}).toString();
                    takes.push_back (*getAnalysedTake (id, expectedFromVar (take), gate));
                    ids.add (id);
                }
                catch (const std::exception&) {}
            }
        }

        if (takes.empty())
            return [done] { done (errorVar (juce::String (juce::CharPointer_UTF8 ("F\xc3\xbc" "r dieses Instrument gibt es noch keine auswertbaren Aufnahmen.")))); };

        int lastPercent = -1;
        const auto result = optimiseTuning (takes, current, [&] (float p)
        {
            const auto percent = juce::roundToInt (p * 100.0f);
            if (percent != lastPercent && progress)
            {
                lastPercent = percent;
                juce::MessageManager::callAsync ([stillAlive, progress, p] { if (stillAlive->load()) progress (p); });
            }
            return stillAlive->load();
        });

        auto evaluation = [&ids] (const TuningEvaluation& e)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("tuning", toVar (e.tuning));
            o->setProperty ("totalCost", e.totalCost);

            juce::Array<juce::var> perTake;
            for (size_t i = 0; i < e.scores.size(); ++i)
            {
                auto* t = new juce::DynamicObject();
                t->setProperty ("id", ids[static_cast<int> (i)]);
                t->setProperty ("accuracy", e.scores[i].accuracy);
                perTake.add (juce::var (t));
            }
            o->setProperty ("takes", perTake);
            return juce::var (o);
        };

        auto* r = new juce::DynamicObject();
        r->setProperty ("combinations", result.combinationsTried);
        r->setProperty ("current", evaluation (result.current));
        r->setProperty ("best", evaluation (result.best));
        juce::var resultVar (r);

        return [done, resultVar] { done (resultVar); };
    });
}

} // namespace ft
