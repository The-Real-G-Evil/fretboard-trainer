#include "app/Bridge.h"

#include "app/Settings.h"
#include "audio/AnalysisWorker.h"
#include "audio/AudioEngine.h"
#include "audio/WavFile.h"

#include <filesystem>

namespace ft
{

namespace
{
    using Completion = juce::WebBrowserComponent::NativeFunctionCompletion;

    juce::var arg (const juce::Array<juce::var>& args, int index)
    {
        return juce::isPositiveAndBelow (index, args.size()) ? args[index] : juce::var();
    }

    float floatProp (const juce::var& obj, const char* name, float fallback)
    {
        const auto v = obj.getProperty (name, fallback);
        return v.isDouble() || v.isInt() || v.isInt64() ? static_cast<float> (static_cast<double> (v)) : fallback;
    }

    juce::var toVarArray (const juce::StringArray& strings)
    {
        juce::Array<juce::var> a;
        for (const auto& s : strings)
            a.add (s);
        return a;
    }

    template <typename T>
    juce::var toVarArray (const juce::Array<T>& values)
    {
        juce::Array<juce::var> a;
        for (auto v : values)
            a.add (v);
        return a;
    }
}

Bridge::Bridge (AudioEngine& e, AnalysisWorker& a, Settings& s, PluginRack& p)
    : engine (e), analysis (a), settings (s), plugins (p), calibration (s.getDataDirectory()), reviews (s.getDataDirectory())
{
    try
    {
        const auto file = s.getDataDirectory().getChildFile ("stats.sqlite");
       #if JUCE_WINDOWS
        stats = std::make_unique<StatsDb> (std::filesystem::path (file.getFullPathName().toWideCharPointer()));
       #else
        stats = std::make_unique<StatsDb> (std::filesystem::path (file.getFullPathName().toStdString()));
       #endif
    }
    catch (const std::exception& ex)
    {
        statsError = ex.what(); // Ueben geht auch ohne Statistik
    }
}

juce::var Bridge::describeSongFile (const juce::File& file)
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("path", file.getFullPathName());
    o->setProperty ("name", file.getFileNameWithoutExtension());

    constexpr juce::int64 maxBytes = 32 * 1024 * 1024;
    juce::MemoryBlock data;
    if (! file.existsAsFile())
        o->setProperty ("error", "Datei nicht gefunden");
    else if (file.getSize() > maxBytes)
        o->setProperty ("error", juce::String (juce::CharPointer_UTF8 ("Datei zu gro\xc3\x9f")));
    else if (! file.loadFileAsData (data))
        o->setProperty ("error", "Datei nicht lesbar");
    else
        o->setProperty ("data", juce::Base64::toBase64 (data.getData(), data.getSize()));

    return juce::var (o);
}

void Bridge::initSoundFont (std::function<bool()> builtin)
{
    loadBuiltinSoundFont = std::move (builtin);
    const auto saved = settings.getUiSettings().getProperty ("songs.soundFont", {}).toString();
    if (juce::File::isAbsolutePath (saved) && loadSoundFontFile (juce::File (saved)))
    {
        soundFontPath = saved;
        return;
    }
    if (loadBuiltinSoundFont)
        loadBuiltinSoundFont();
}

bool Bridge::loadSoundFontFile (const juce::File& file)
{
    juce::MemoryBlock data;
    return file.existsAsFile() && file.loadFileAsData (data)
        && engine.getSongPlayer().loadSoundFont (data.getData(), static_cast<int> (data.getSize()));
}

juce::var Bridge::describeSoundFont() const
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("builtin", soundFontPath.isEmpty());
    o->setProperty ("path", soundFontPath);
    o->setProperty ("name", soundFontPath.isEmpty() ? juce::String ("Sonivox (eingebaut)")
                                                    : juce::File (soundFontPath).getFileNameWithoutExtension());
    return juce::var (o);
}

juce::var Bridge::describePlugins() const
{
    juce::Array<juce::var> available;
    for (const auto& d : plugins.getAvailable())
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", d.createIdentifierString());
        o->setProperty ("name", d.name);
        o->setProperty ("vendor", d.manufacturerName);
        o->setProperty ("category", d.category);
        available.add (juce::var (o));
    }
    const auto sr = juce::jmax (1.0, engine.getSampleRate());
    juce::Array<juce::var> rack;
    for (const auto& s : plugins.getSlots())
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("name", s.name);
        o->setProperty ("vendor", s.vendor);
        o->setProperty ("enabled", s.enabled);
        o->setProperty ("latencyMs", 1000.0 * s.latencySamples / sr);
        o->setProperty ("hasEditor", s.hasEditor);
        rack.add (juce::var (o));
    }
    auto* r = new juce::DynamicObject();
    r->setProperty ("scanned", plugins.hasScanned());
    r->setProperty ("scanning", plugins.isScanning());
    r->setProperty ("available", available);
    r->setProperty ("rack", rack);
    r->setProperty ("latencyMs", 1000.0 * plugins.getLatencySamples() / sr);
    return juce::var (r);
}

juce::File Bridge::diagnosticDirectory()
{
    return juce::File::getSpecialLocation (juce::File::userDocumentsDirectory)
        .getChildFile ("Fretboard Trainer").getChildFile ("Diagnose");
}

std::shared_ptr<const AnalysisWorker::RecordedAudio> Bridge::takeRunAudio()
{
    // Nachanalyse und Diagnose-Aufnahme beenden den Durchgang unabhaengig voneinander: wer zuerst kommt,
    // stoppt den Mitschnitt, beide benutzen ihn
    if (analysis.isRecording())
        lastRunAudio = std::make_shared<const AnalysisWorker::RecordedAudio> (analysis.stopRecording());
    return lastRunAudio;
}

void Bridge::saveDiagnostic (const juce::var& log, juce::WebBrowserComponent::NativeFunctionCompletion done)
{
    const auto run = takeRunAudio();
    auto audio = run != nullptr ? *run : AnalysisWorker::RecordedAudio {};
    if (audio.samples.empty())
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("error", "Keine Aufnahme vorhanden");
        done (juce::var (o));
        return;
    }

    const auto dir = diagnosticDirectory();
    const auto base = juce::Time::getCurrentTime().formatted ("%Y-%m-%d_%H-%M-%S");
    const auto wavFile = dir.getChildFile (base + ".wav");
    const auto jsonFile = dir.getChildFile (base + ".json");

    // Protokoll der Oberflaeche + Bezug der Aufnahme zur Stream-Uhr + aktuelle Erkennungseinstellungen
    auto* rec = new juce::DynamicObject();
    rec->setProperty ("file", wavFile.getFileName());
    rec->setProperty ("sampleRate", audio.sampleRate);
    rec->setProperty ("startMs", audio.startSec * 1000.0);
    rec->setProperty ("durationSec", static_cast<double> (audio.samples.size()) / audio.sampleRate);
    rec->setProperty ("truncated", audio.truncated);

    auto* root = new juce::DynamicObject();
    root->setProperty ("version", 1);
    root->setProperty ("recording", juce::var (rec));
    root->setProperty ("settings", describeSettings());
    root->setProperty ("log", log);
    const auto json = juce::JSON::toString (juce::var (root));

    // Schreiben im Hintergrund (bei langen Aufnahmen > 100 MB)
    juce::Thread::launch ([audio = std::move (audio), dir, wavFile, jsonFile, json, done = std::move (done)]
    {
        auto* r = new juce::DynamicObject();
        try
        {
            if (! dir.createDirectory())
                throw std::runtime_error ("Ordner nicht anlegbar: " + dir.getFullPathName().toStdString());
           #if JUCE_WINDOWS
            writeWavFloat (std::filesystem::path (wavFile.getFullPathName().toWideCharPointer()), audio.samples, audio.sampleRate);
           #else
            writeWavFloat (std::filesystem::path (wavFile.getFullPathName().toStdString()), audio.samples, audio.sampleRate);
           #endif
            if (! jsonFile.replaceWithText (json))
                throw std::runtime_error ("Protokoll nicht schreibbar");
            r->setProperty ("path", wavFile.getFullPathName());
        }
        catch (const std::exception& ex)
        {
            r->setProperty ("error", juce::String (ex.what()));
        }
        juce::MessageManager::callAsync ([done, result = juce::var (r)] { done (result); });
    });
}

juce::WebBrowserComponent::Options Bridge::registerFunctions (juce::WebBrowserComponent::Options options)
{
    return options
        .withNativeFunction ("getAudioDevices", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeDevices());
        })
        .withNativeFunction ("setAudioDevice", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto cfgVar = arg (args, 0);

            AudioEngine::DeviceConfig cfg;
            cfg.type         = cfgVar.getProperty ("type", {}).toString();
            cfg.inputDevice  = cfgVar.getProperty ("inputDevice", {}).toString();
            cfg.outputDevice = cfgVar.getProperty ("outputDevice", {}).toString();
            cfg.sampleRate   = static_cast<double> (cfgVar.getProperty ("sampleRate", 0.0));
            cfg.bufferSize   = static_cast<int> (cfgVar.getProperty ("bufferSize", 0));
            cfg.inputChannel = static_cast<int> (cfgVar.getProperty ("inputChannel", 0));

            const auto error = engine.setDeviceConfig (cfg);
            persistDeviceState();
            done (describeDevices (error));
        })
        .withNativeFunction ("setInputGain", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto db = juce::jlimit (-60.0f, 40.0f, static_cast<float> (static_cast<double> (arg (args, 0))));
            engine.setInputGainDb (db);
            settings.setInputGainDb (db);
            done ({});
        })
        .withNativeFunction ("setMonitoring", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto on = static_cast<bool> (arg (args, 0));
            const auto volumeDb = juce::jlimit (-100.0f, 12.0f, static_cast<float> (static_cast<double> (arg (args, 1))));
            engine.setMonitoring (on, volumeDb);
            settings.setMonitoring (on, volumeDb);
            done ({});
        })
        .withNativeFunction ("setNoiseGate", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            auto p = settings.getNoiseGate();
            p.thresholdDb  = juce::jlimit (-100.0f, 0.0f,   floatProp (obj, "thresholdDb",  p.thresholdDb));
            p.attackMs     = juce::jlimit (0.0f,    500.0f, floatProp (obj, "attackMs",     p.attackMs));
            p.holdMs       = juce::jlimit (0.0f,   2000.0f, floatProp (obj, "holdMs",       p.holdMs));
            p.releaseMs    = juce::jlimit (0.0f,   5000.0f, floatProp (obj, "releaseMs",    p.releaseMs));
            p.hysteresisDb = juce::jlimit (0.0f,     40.0f, floatProp (obj, "hysteresisDb", p.hysteresisDb));
            engine.setNoiseGate (p);
            settings.setNoiseGate (p);
            done ({});
        })
        .withNativeFunction ("getPlugins", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describePlugins());
        })
        .withNativeFunction ("scanPlugins", [this] (const juce::Array<juce::var>&, Completion done)
        {
            plugins.scan ([this] (float progress, juce::String current)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("progress", progress);
                o->setProperty ("current", current);
                if (emitEvent)
                    emitEvent ("pluginScan", juce::var (o));
            },
            [this]
            {
                auto result = describePlugins();
                result.getDynamicObject()->setProperty ("done", true);
                if (emitEvent)
                    emitEvent ("pluginScan", result);
            });
            done (describePlugins());
        })
        .withNativeFunction ("addPlugin", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            plugins.add (arg (args, 0).toString(), [this, done] (juce::String error)
            {
                if (error.isNotEmpty())
                {
                    auto* o = new juce::DynamicObject();
                    o->setProperty ("error", error);
                    return done (juce::var (o));
                }
                done (describePlugins());
            });
        })
        .withNativeFunction ("removePlugin", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            plugins.remove (static_cast<int> (arg (args, 0)));
            done (describePlugins());
        })
        .withNativeFunction ("movePlugin", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            plugins.move (static_cast<int> (arg (args, 0)), static_cast<int> (arg (args, 1)));
            done (describePlugins());
        })
        .withNativeFunction ("setPluginEnabled", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            plugins.setEnabled (static_cast<int> (arg (args, 0)), static_cast<bool> (arg (args, 1)));
            done (describePlugins());
        })
        .withNativeFunction ("openPluginEditor", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            plugins.openEditor (static_cast<int> (arg (args, 0)));
            done (describePlugins());
        })
        .withNativeFunction ("getEffects", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (effectsToVar (settings.getEffects()));
        })
        .withNativeFunction ("setEffects", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto p = effectsFromVar (arg (args, 0), settings.getEffects());
            engine.setEffects (p);
            settings.setEffects (p);
            done (effectsToVar (p));
        })
        .withNativeFunction ("setDetectionConfig", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            auto c = settings.getDetectionConfig();
            c.minHz          = juce::jlimit (20.0f, 500.0f,  floatProp (obj, "minHz", c.minHz));
            c.maxHz          = juce::jlimit (c.minHz * 2.0f, 4000.0f, floatProp (obj, "maxHz", c.maxHz));
            c.centsTolerance = juce::jlimit (1.0f, 50.0f,    floatProp (obj, "centsTolerance", c.centsTolerance));
            analysis.setDetectionConfig (c); // Tuning bleibt erhalten (kommt aus den Einstellungen)
            settings.setDetectionConfig (c);
            done ({});
        })
        .withNativeFunction ("setInstrument", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            const auto id = obj.getProperty ("id", {}).toString();

            if (id.isNotEmpty())
            {
                const auto tolerance = settings.getDetectionConfig().centsTolerance;
                settings.setInstrumentId (id);

                // Erstes Mal mit diesem Instrument: Profil mit dem Standard-Tonbereich anlegen
                if (! settings.hasProfile (id))
                {
                    AnalysisWorker::DetectionConfig c;
                    c.minHz = juce::jlimit (20.0f, 500.0f, floatProp (obj, "minHz", c.minHz));
                    c.maxHz = juce::jlimit (c.minHz * 2.0f, 4000.0f, floatProp (obj, "maxHz", c.maxHz));
                    c.centsTolerance = tolerance;
                    settings.setDetectionConfig (c);
                }

                analysis.setDetectionConfig (settings.getDetectionConfig());
                reevaluateCalibration();
            }

            done (describeSettings());
        })
        .withNativeFunction ("setExpectedNotes", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            std::vector<int> midis;
            if (const auto* arr = arg (args, 0).getArray())
                for (const auto& m : *arr)
                    if (m.isInt() || m.isDouble() || m.isInt64())
                        midis.push_back (juce::jlimit (0, 127, static_cast<int> (m)));
            analysis.setExpectedNotes (std::move (midis));
            done ({});
        })
        .withNativeFunction ("setMetronome", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            AudioEngine::MetronomeSettings m;
            m.on          = static_cast<bool> (obj.getProperty ("on", false));
            m.bpm         = juce::jlimit (20.0, 400.0, static_cast<double> (obj.getProperty ("bpm", 80.0)));
            m.volumeDb    = juce::jlimit (-60.0f, 6.0f, floatProp (obj, "volumeDb", -6.0f));
            m.beatsPerBar = juce::jlimit (0, 16, static_cast<int> (obj.getProperty ("beatsPerBar", 4)));
            engine.setMetronome (m);
            done ({});
        })
        .withNativeFunction ("statsStartSession", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&]
            {
                const auto o = arg (args, 0);
                StatsDb::SessionInfo info;
                info.instrument = o.getProperty ("instrument", {}).toString().toStdString();
                info.difficulty = o.getProperty ("difficulty", {}).toString().toStdString();
                info.mode       = o.getProperty ("mode", {}).toString().toStdString();
                info.tempo      = o.getProperty ("tempo", {}).toString().toStdString();
                info.bpm        = static_cast<double> (o.getProperty ("bpm", 0.0));
                if (o.getProperty ("source", {}).toString() == "gp")
                {
                    info.source = "gp";
                    info.gpFile = o.getProperty ("gpFile", {}).toString().toStdString();
                    info.gpTrack = static_cast<int> (o.getProperty ("gpTrack", -1));
                }
                else if (o.getProperty ("source", {}).toString() == "scale")
                {
                    info.source = "scale"; // Name der Tonleiter steht im Feld der Liederdatei
                    info.gpFile = o.getProperty ("gpFile", {}).toString().toStdString();
                }
                if (const auto w = o.getProperty ("dynamicsWindowDb", {}); ! w.isVoid() && ! w.isUndefined())
                    info.dynamicsWindowDb = static_cast<double> (w);

                auto* r = new juce::DynamicObject();
                r->setProperty ("id", static_cast<juce::int64> (stats->startSession (info)));
                return juce::var (r);
            });
        })
        .withNativeFunction ("statsAddAttempt", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&]
            {
                const auto o = arg (args, 1);
                auto optional = [&] (const char* name) -> std::optional<double>
                {
                    const auto v = o.getProperty (name, {});
                    if (v.isVoid() || v.isUndefined())
                        return std::nullopt;
                    return static_cast<double> (v);
                };

                StatsDb::Attempt a;
                a.expectedMidi = static_cast<int> (o.getProperty ("expectedMidi", 0));
                a.string       = static_cast<int> (o.getProperty ("string", -1));
                a.fret         = static_cast<int> (o.getProperty ("fret", -1));
                if (const auto p = optional ("playedMidi"))
                    a.playedMidi = static_cast<int> (*p);
                a.cents        = floatProp (o, "cents", 0.0f);
                a.reactionMs   = optional ("reactionMs");
                a.timingMs     = optional ("timingMs");
                a.onsetType    = o.getProperty ("onsetType", {}).toString().toStdString();
                a.correct      = static_cast<bool> (o.getProperty ("correct", false));
                a.levelDb      = optional ("levelDb");
                a.levelDevDb   = optional ("levelDevDb");
                if (const auto b = optional ("bar"))
                    a.bar = static_cast<int> (*b);
                stats->addAttempt (static_cast<long long> (static_cast<juce::int64> (arg (args, 0))), a);
                return juce::var();
            });
        })
        .withNativeFunction ("statsEndSession", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&]
            {
                const auto o = arg (args, 1);
                stats->endSession (static_cast<long long> (static_cast<juce::int64> (arg (args, 0))),
                                   static_cast<int> (o.getProperty ("score", 0)),
                                   static_cast<double> (o.getProperty ("durationSec", 0.0)));
                return juce::var();
            });
        })
        .withNativeFunction ("getStats", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&] { return describeStats (arg (args, 0).toString()); });
        })
        .withNativeFunction ("getSongStats", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&]
            {
                juce::Array<juce::var> bars;
                for (const auto& b : stats->barStats (arg (args, 0).toString().toStdString(),
                                                      arg (args, 1).toString().toStdString(),
                                                      static_cast<int> (arg (args, 2))))
                {
                    auto* o = new juce::DynamicObject();
                    o->setProperty ("bar", b.bar);
                    o->setProperty ("attempts", b.attempts);
                    o->setProperty ("hits", b.hits);
                    bars.add (juce::var (o));
                }
                auto* r = new juce::DynamicObject();
                r->setProperty ("bars", bars);
                return juce::var (r);
            });
        })
        .withNativeFunction ("clearStats", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            withStats (done, [&]
            {
                stats->clear (arg (args, 0).toString().toStdString());
                return juce::var();
            });
        })
        .withNativeFunction ("getUiSettings", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (settings.getUiSettings());
        })
        .withNativeFunction ("setUiSetting", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto key = arg (args, 0).toString();
            if (key.containsOnly ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-") && key.isNotEmpty())
                settings.setUiSetting (key, arg (args, 1));
            done ({});
        })
        .withNativeFunction ("getSettings", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeSettings());
        })
        .withNativeFunction ("startRecording", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto maxSec = arg (args, 1);
            analysis.startRecording (maxSec.isVoid() ? AnalysisWorker::maxRecordingSec
                                                     : juce::jlimit (1.0, 900.0, static_cast<double> (maxSec)));
            done (true);
        })
        .withNativeFunction ("runRecordingStart", [this] (const juce::Array<juce::var>&, Completion done)
        {
            lastRunAudio.reset();
            analysis.startRecording (600.0);
            done (true);
        })
        .withNativeFunction ("reviewFinish", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            auto audio = takeRunAudio();
            const auto id = arg (args, 0);
            const auto o = arg (args, 1);
            auto* skipped = new juce::DynamicObject();
            skipped->setProperty ("skipped", true);
            if (id.isVoid() || id.isUndefined() || stats == nullptr || ! o.isObject()
                || ! stats->sessionExists (static_cast<juce::int64> (id)))
                return done (juce::var (skipped)); // ohne Statistik bzw. Durchgang ohne Versuche
            delete skipped;

            ReviewStore::Request r;
            r.sessionId = static_cast<juce::int64> (id);
            r.mode = o.getProperty ("mode", {}).toString();
            r.toleranceMs = static_cast<double> (o.getProperty ("toleranceMs", 0.0));
            r.items = o.getProperty ("items", {});
            r.liveHits = static_cast<int> (o.getProperty ("liveHits", 0));
            r.liveMisses = static_cast<int> (o.getProperty ("liveMisses", 0));
            reviews.analyse (r, std::move (audio), settings.getNoiseGate(), settings.getDetectionConfig(),
                             [this, done] (juce::var result)
            {
                if (stats != nullptr && result.hasProperty ("finalHits"))
                {
                    try
                    {
                        const auto sessionId = static_cast<long long> (static_cast<juce::int64> (result.getProperty ("sessionId", 0)));
                        stats->setFinalResult (sessionId, result.getProperty ("finalHits", 0), result.getProperty ("finalTotal", 0));
                        reviews.prune ([this] (long long s) { return stats->sessionExists (s); }, 25);
                    }
                    catch (const std::exception& ex)
                    {
                        result.getDynamicObject()->setProperty ("error", juce::String (ex.what()));
                    }
                }
                done (result);
            });
        })
        .withNativeFunction ("getReview", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            done (reviews.load (static_cast<juce::int64> (arg (args, 0))));
        })
        .withNativeFunction ("playReview", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            auto clip = reviews.loadClip (static_cast<juce::int64> (arg (args, 0)), arg (args, 1), arg (args, 2),
                                          engine.getSampleRate());
            // leise Aufnahmen (Eingang ohne Gain) auf hoerbaren Pegel bringen, hoechstens +26 dB
            float peak = 1e-6f;
            for (const auto x : clip)
                peak = std::max (peak, std::abs (x));
            engine.getClipPlayer().play (std::move (clip), juce::jmin (20.0f, 0.7f / peak));
            done (true);
        })
        .withNativeFunction ("stopReview", [this] (const juce::Array<juce::var>&, Completion done)
        {
            engine.getClipPlayer().stop();
            done (true);
        })
        .withNativeFunction ("stopRecording", [this] (const juce::Array<juce::var>&, Completion done)
        {
            lastRecording = analysis.stopRecording();

            auto* o = new juce::DynamicObject();
            o->setProperty ("durationSec", lastRecording.sampleRate > 0.0
                                               ? static_cast<double> (lastRecording.samples.size()) / lastRecording.sampleRate
                                               : 0.0);
            o->setProperty ("truncated", lastRecording.truncated);
            done (juce::var (o));
        })
        .withNativeFunction ("songLoad", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto o = arg (args, 0);
            auto song = std::make_unique<SongPlayer::Song>();
            song->ppq = static_cast<int> (o.getProperty ("ppq", 960));
            if (const auto* tempo = o.getProperty ("tempo", {}).getArray())
                for (const auto& t : *tempo)
                    song->tempo.push_back ({ static_cast<long long> (static_cast<juce::int64> (t[0])), static_cast<double> (t[1]) });
            if (song->tempo.empty() || song->tempo.front().tick != 0)
                song->tempo.insert (song->tempo.begin(), { 0, song->tempo.empty() ? 120.0 : song->tempo.front().bpm });
            if (const auto* events = o.getProperty ("events", {}).getArray())
            {
                song->events.reserve (static_cast<size_t> (events->size()));
                for (const auto& e : *events)
                    song->events.push_back ({ static_cast<long long> (static_cast<juce::int64> (e[0])),
                                              static_cast<unsigned char> (static_cast<int> (e[1])),
                                              static_cast<unsigned char> (static_cast<int> (e[2])),
                                              static_cast<unsigned char> (static_cast<int> (e[3])) });
            }
            std::stable_sort (song->events.begin(), song->events.end(), [] (const auto& a, const auto& b) { return a.tick < b.tick; });
            if (const auto* halts = o.getProperty ("halts", {}).getArray())
                for (const auto& h : *halts)
                    song->haltTicks.push_back (static_cast<long long> (static_cast<juce::int64> (h)));
            std::sort (song->haltTicks.begin(), song->haltTicks.end());

            auto& player = engine.getSongPlayer();
            player.pause();
            player.setSong (std::move (song));
            auto* r = new juce::DynamicObject();
            r->setProperty ("soundFont", player.hasSoundFont());
            done (juce::var (r));
        })
        .withNativeFunction ("songSetHalts", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            std::vector<long long> ticks;
            if (const auto* halts = arg (args, 0).getArray())
                for (const auto& h : *halts)
                    ticks.push_back (static_cast<long long> (static_cast<juce::int64> (h)));
            engine.getSongPlayer().setHaltTicks (std::move (ticks));
            done ({});
        })
        .withNativeFunction ("songPlay", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().play (static_cast<bool> (arg (args, 0)));
            done ({});
        })
        .withNativeFunction ("songPause", [this] (const juce::Array<juce::var>&, Completion done)
        {
            engine.getSongPlayer().pause();
            done ({});
        })
        .withNativeFunction ("songSeek", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().seek (static_cast<juce::int64> (arg (args, 0)));
            done ({});
        })
        .withNativeFunction ("songSetSpeed", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().setSpeed (static_cast<double> (arg (args, 0)));
            done ({});
        })
        .withNativeFunction ("songSetRange", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().setRange (static_cast<juce::int64> (arg (args, 0)), static_cast<juce::int64> (arg (args, 1)),
                                             static_cast<bool> (arg (args, 2)), static_cast<int> (arg (args, 3)));
            done ({});
        })
        .withNativeFunction ("songSetChannelGains", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            if (const auto* gains = arg (args, 0).getArray())
                for (int ch = 0; ch < juce::jmin (16, gains->size()); ++ch)
                    engine.getSongPlayer().setChannelGain (ch, static_cast<float> (static_cast<double> ((*gains)[ch])));
            done ({});
        })
        .withNativeFunction ("songSetMetronome", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().setMetronome (static_cast<bool> (arg (args, 0)), static_cast<float> (static_cast<double> (arg (args, 1))));
            done ({});
        })
        .withNativeFunction ("songSetWaitMode", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().setWaitMode (static_cast<bool> (arg (args, 0)));
            done ({});
        })
        .withNativeFunction ("songSetReleased", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            engine.getSongPlayer().setReleased (static_cast<int> (arg (args, 0)), static_cast<int> (arg (args, 1)));
            done ({});
        })
        .withNativeFunction ("getSoundFont", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeSoundFont());
        })
        .withNativeFunction ("chooseSoundFont", [this] (const juce::Array<juce::var>&, Completion done)
        {
            const auto start = soundFontPath.isNotEmpty() ? juce::File (soundFontPath).getParentDirectory()
                                                          : juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
            soundFontChooser = std::make_unique<juce::FileChooser> ("Soundfont (SF2)", start, "*.sf2");
            soundFontChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                                           [this, done] (const juce::FileChooser& fc)
            {
                const auto file = fc.getResult();
                if (file == juce::File() || soundFontLoading.exchange (true))
                {
                    done ({});
                    return;
                }
                // Laden im Hintergrund (grosse Soundfonts brauchen einige Sekunden)
                juce::Thread::launch ([this, done, file]
                {
                    const bool ok = loadSoundFontFile (file);
                    juce::MessageManager::callAsync ([this, done, ok, file]
                    {
                        soundFontLoading = false;
                        if (ok)
                            soundFontPath = file.getFullPathName();
                        if (! ok)
                        {
                            auto* e = new juce::DynamicObject();
                            e->setProperty ("error", file.getFileName() + ": kein lesbarer SF2-Soundfont");
                            done (juce::var (e));
                            return;
                        }
                        settings.setUiSetting ("songs.soundFont", soundFontPath);
                        done (describeSoundFont());
                    });
                });
            });
        })
        .withNativeFunction ("resetSoundFont", [this] (const juce::Array<juce::var>&, Completion done)
        {
            if (loadBuiltinSoundFont && loadBuiltinSoundFont())
                soundFontPath.clear();
            settings.setUiSetting ("songs.soundFont", {});
            done (describeSoundFont());
        })
        .withNativeFunction ("getStreamTime", [this] (const juce::Array<juce::var>&, Completion done)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("streamMs", engine.getStreamTimeMs());
            o->setProperty ("inputLatencyMs", engine.getInputLatencyMs());
            done (juce::var (o));
        })
        .withNativeFunction ("openSongFile", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            // Startordner: von der Oberflaeche (Ordner des letzten Lieds), sonst zuletzt benutzter Ordner
            // (dauerhaft in den Einstellungen), sonst Dokumente
            const auto asDir = [] (const juce::String& path)
            {
                return juce::File::isAbsolutePath (path) && juce::File (path).isDirectory() ? juce::File (path) : juce::File();
            };
            auto start = asDir (arg (args, 0).toString());
            if (start == juce::File()) start = lastSongDirectory.isDirectory() ? lastSongDirectory : juce::File();
            if (start == juce::File()) start = asDir (settings.getUiSettings().getProperty ("songs.lastDir", {}).toString());
            if (start == juce::File()) start = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
            songChooser = std::make_unique<juce::FileChooser> (juce::String (juce::CharPointer_UTF8 ("Guitar-Pro-Datei \xc3\xb6" "ffnen")), start,
                                                               "*.gp;*.gp3;*.gp4;*.gp5;*.gpx");
            songChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                                      [this, done] (const juce::FileChooser& fc)
                                      {
                                          const auto file = fc.getResult();
                                          if (file == juce::File())
                                          {
                                              done ({}); // abgebrochen
                                              return;
                                          }
                                          lastSongDirectory = file.getParentDirectory();
                                          settings.setUiSetting ("songs.lastDir", lastSongDirectory.getFullPathName());
                                          done (describeSongFile (file));
                                      });
        })
        .withNativeFunction ("readSongFile", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto path = arg (args, 0).toString();
            done (juce::File::isAbsolutePath (path) ? describeSongFile (juce::File (path)) : juce::var());
        })
        .withNativeFunction ("saveDiagnostic", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            saveDiagnostic (arg (args, 0), std::move (done));
        })
        .withNativeFunction ("getCalibration", [this] (const juce::Array<juce::var>&, Completion done)
        {
            done (describeCalibration());
        })
        .withNativeFunction ("saveCalibrationTake", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);

            CalibrationStore::TakeInfo info;
            info.instrument = obj.getProperty ("instrument", {}).toString();
            info.exerciseId = obj.getProperty ("exerciseId", {}).toString();
            info.title      = obj.getProperty ("title", {}).toString();
            info.kind       = obj.getProperty ("kind", "notes").toString() == "silence" ? "silence" : "notes";
            info.level      = static_cast<int> (obj.getProperty ("level", 1));
            info.expected.minHz = floatProp (obj, "minHz", 55.0f);
            info.expected.maxHz = floatProp (obj, "maxHz", 1500.0f);

            if (const auto* notes = obj.getProperty ("notes", {}).getArray())
                for (const auto& n : *notes)
                    info.expected.notes.push_back ({ static_cast<int> (n.getProperty ("midi", 0)),
                                                     n.getProperty ("type", "pick").toString() == "legato" ? OnsetType::legato
                                                                                                         : OnsetType::pick,
                                                     std::nullopt });

            calibration.addTake (info, std::exchange (lastRecording, {}), settings.getNoiseGate(),
                                 settings.getDetectionConfig().tuning, [done] (juce::var r) { done (r); });
        })
        .withNativeFunction ("deleteCalibrationTake", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            done (calibration.removeTake (arg (args, 0).toString()));
        })
        .withNativeFunction ("optimizeCalibration", [this] (const juce::Array<juce::var>&, Completion done)
        {
            calibration.optimise (settings.getInstrumentId(), settings.getNoiseGate(), settings.getDetectionConfig().tuning,
                                  [this] (float p)
                                  {
                                      auto* o = new juce::DynamicObject();
                                      o->setProperty ("progress", p);
                                      if (emitEvent)
                                          emitEvent ("calibrationProgress", juce::var (o));
                                  },
                                  [done] (juce::var r) { done (r); });
        })
        .withNativeFunction ("setDetectionTuning", [this] (const juce::Array<juce::var>& args, Completion done)
        {
            const auto obj = arg (args, 0);
            auto c = settings.getDetectionConfig();
            const DetectionTuning defaults;

            if (obj.isObject())
            {
                c.tuning.minRiseDb        = juce::jlimit (0.5f, 20.0f, floatProp (obj, "minRiseDb", c.tuning.minRiseDb));
                c.tuning.strongFluxFactor = juce::jlimit (1.0f, 100.0f, floatProp (obj, "strongFluxFactor", c.tuning.strongFluxFactor));
                c.tuning.fluxMultiplier   = juce::jlimit (1.0f, 5.0f, floatProp (obj, "fluxMultiplier", c.tuning.fluxMultiplier));
                c.tuning.stableFrames     = juce::jlimit (1, 10, static_cast<int> (obj.getProperty ("stableFrames", c.tuning.stableFrames)));
                c.tuning.legatoFrames     = juce::jlimit (1, 60, static_cast<int> (obj.getProperty ("legatoFrames", c.tuning.legatoFrames)));
            }
            else
            {
                c.tuning = defaults;
            }

            analysis.setDetectionConfig (c);
            settings.setDetectionConfig (c);

            calibration.evaluateAll (settings.getInstrumentId(), settings.getNoiseGate(), c.tuning, [this, done] (juce::var)
            {
                done (describeCalibration());
            });
        });
}

void Bridge::withStats (const juce::WebBrowserComponent::NativeFunctionCompletion& done,
                        const std::function<juce::var()>& work)
{
    auto error = [&done] (const juce::String& message)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("error", message);
        done (juce::var (o));
    };

    if (stats == nullptr)
        return error ("Statistik nicht verfuegbar: " + statsError);

    try
    {
        done (work());
    }
    catch (const std::exception& ex)
    {
        error (ex.what());
    }
}

juce::var Bridge::describeStats (const juce::String& instrument)
{
    const auto id = instrument.toStdString();

    juce::Array<juce::var> notes;
    for (const auto& n : stats->noteStats (id))
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("midi", n.midi);
        o->setProperty ("string", n.string);
        o->setProperty ("fret", n.fret);
        o->setProperty ("attempts", n.attempts);
        o->setProperty ("hits", n.hits);
        o->setProperty ("avgReactionMs", n.avgReactionMs);
        o->setProperty ("avgTimingAbsMs", n.avgTimingAbsMs);
        o->setProperty ("lastPracticed", juce::String (n.lastPracticed));
        notes.add (juce::var (o));
    }

    juce::Array<juce::var> sessions;
    for (const auto& s : stats->sessions (id, 50))
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", static_cast<juce::int64> (s.id));
        o->setProperty ("startedAt", juce::String (s.startedAt));
        o->setProperty ("difficulty", juce::String (s.difficulty));
        o->setProperty ("mode", juce::String (s.mode));
        o->setProperty ("tempo", juce::String (s.tempo));
        o->setProperty ("bpm", s.bpm);
        o->setProperty ("durationSec", s.durationSec);
        o->setProperty ("score", s.score);
        o->setProperty ("hits", s.hits);
        o->setProperty ("misses", s.misses);
        o->setProperty ("avgReactionMs", s.avgReactionMs);
        o->setProperty ("avgTimingAbsMs", s.avgTimingAbsMs);
        o->setProperty ("source", juce::String (s.source));
        o->setProperty ("gpFile", juce::String::fromUTF8 (s.gpFile.c_str()));
        if (s.finalHits)
        {
            o->setProperty ("finalHits", *s.finalHits);
            o->setProperty ("finalTotal", *s.finalTotal);
        }
        if (s.dynamicsWindowDb)
        {
            o->setProperty ("dynamicsWindowDb", *s.dynamicsWindowDb);
            o->setProperty ("levelRated", s.levelRated);
            o->setProperty ("levelInWindowRate", s.levelInWindowRate);
            o->setProperty ("levelSpreadDb", s.levelSpreadDb);
        }
        sessions.add (juce::var (o));
    }

    juce::Array<juce::var> confusions;
    for (const auto& c : stats->confusions (id, 10))
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("expectedMidi", c.expectedMidi);
        o->setProperty ("playedMidi", c.playedMidi);
        o->setProperty ("count", c.count);
        confusions.add (juce::var (o));
    }

    juce::Array<juce::var> levels;
    for (const auto& l : stats->levelStats (id))
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("midi", l.midi);
        o->setProperty ("avgDevDb", l.avgDevDb);
        o->setProperty ("count", l.count);
        levels.add (juce::var (o));
    }

    auto* r = new juce::DynamicObject();
    r->setProperty ("notes", notes);
    r->setProperty ("sessions", sessions);
    r->setProperty ("confusions", confusions);
    r->setProperty ("levels", levels);
    return juce::var (r);
}

void Bridge::reevaluateCalibration()
{
    calibration.evaluateAll (settings.getInstrumentId(), settings.getNoiseGate(), settings.getDetectionConfig().tuning,
                             [this] (juce::var)
                             {
                                 if (emitEvent)
                                     emitEvent ("calibrationUpdated", juce::var (new juce::DynamicObject()));
                             });
}

juce::var Bridge::describeCalibration() const
{
    auto tuningVar = [] (const DetectionTuning& t)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("minRiseDb", t.minRiseDb);
        o->setProperty ("strongFluxFactor", t.strongFluxFactor);
        o->setProperty ("fluxMultiplier", t.fluxMultiplier);
        o->setProperty ("stableFrames", t.stableFrames);
        o->setProperty ("legatoFrames", t.legatoFrames);
        return juce::var (o);
    };

    auto* o = new juce::DynamicObject();
    o->setProperty ("takes", calibration.getTakes());
    o->setProperty ("instrument", settings.getInstrumentId());
    o->setProperty ("tuning", tuningVar (settings.getDetectionConfig().tuning));
    o->setProperty ("defaultTuning", tuningVar (DetectionTuning {}));
    o->setProperty ("busy", calibration.isBusy());
    return juce::var (o);
}

void Bridge::persistDeviceState()
{
    const auto xml = engine.createDeviceStateXml();
    settings.setAudioDeviceState (xml.get());
}

juce::var Bridge::describeDevices (const juce::String& error)
{
    auto& dm = engine.getDeviceManager();

    juce::Array<juce::var> types;
    for (auto* type : dm.getAvailableDeviceTypes())
    {
        if (scannedTypes.insert (type->getTypeName()).second)
            type->scanForDevices();

        auto* t = new juce::DynamicObject();
        t->setProperty ("name", type->getTypeName());
        t->setProperty ("inputs", toVarArray (type->getDeviceNames (true)));
        t->setProperty ("outputs", toVarArray (type->getDeviceNames (false)));
        t->setProperty ("separateInputsAndOutputs", type->hasSeparateInputsAndOutputs());
        types.add (juce::var (t));
    }

    const auto cfg = engine.getDeviceConfig();
    auto* current = new juce::DynamicObject();
    current->setProperty ("type", cfg.type);
    current->setProperty ("inputDevice", cfg.inputDevice);
    current->setProperty ("outputDevice", cfg.outputDevice);
    current->setProperty ("sampleRate", cfg.sampleRate);
    current->setProperty ("bufferSize", cfg.bufferSize);
    current->setProperty ("inputChannel", cfg.inputChannel);

    auto* result = new juce::DynamicObject();
    result->setProperty ("types", types);
    result->setProperty ("current", juce::var (current));

    if (auto* device = dm.getCurrentAudioDevice())
    {
        result->setProperty ("inputChannels", toVarArray (device->getInputChannelNames()));
        result->setProperty ("sampleRates", toVarArray (device->getAvailableSampleRates()));
        result->setProperty ("bufferSizes", toVarArray (device->getAvailableBufferSizes()));
        result->setProperty ("latencyMs", 1000.0 * (device->getInputLatencyInSamples()
                                                    + device->getOutputLatencyInSamples()
                                                    + 2 * device->getCurrentBufferSizeSamples())
                                             / juce::jmax (1.0, device->getCurrentSampleRate()));
    }
    else
    {
        result->setProperty ("inputChannels", juce::Array<juce::var>());
        result->setProperty ("sampleRates", juce::Array<juce::var>());
        result->setProperty ("bufferSizes", juce::Array<juce::var>());
    }

    result->setProperty ("error", error);
    return juce::var (result);
}

juce::var Bridge::describeSettings() const
{
    const auto gate = settings.getNoiseGate();

    auto* g = new juce::DynamicObject();
    g->setProperty ("thresholdDb", gate.thresholdDb);
    g->setProperty ("attackMs", gate.attackMs);
    g->setProperty ("holdMs", gate.holdMs);
    g->setProperty ("releaseMs", gate.releaseMs);
    g->setProperty ("hysteresisDb", gate.hysteresisDb);

    auto* m = new juce::DynamicObject();
    m->setProperty ("on", settings.getMonitoringOn());
    m->setProperty ("volumeDb", settings.getMonitorVolumeDb());

    const auto detection = settings.getDetectionConfig();
    auto* d = new juce::DynamicObject();
    d->setProperty ("minHz", detection.minHz);
    d->setProperty ("maxHz", detection.maxHz);
    d->setProperty ("centsTolerance", detection.centsTolerance);

    auto* result = new juce::DynamicObject();
    result->setProperty ("inputGainDb", settings.getInputGainDb());
    result->setProperty ("monitoring", juce::var (m));
    result->setProperty ("noiseGate", juce::var (g));
    result->setProperty ("detection", juce::var (d));
    result->setProperty ("instrument", settings.getInstrumentId());
    result->setProperty ("version", juce::String (FT_VERSION_LABEL));
    return juce::var (result);
}

} // namespace ft
