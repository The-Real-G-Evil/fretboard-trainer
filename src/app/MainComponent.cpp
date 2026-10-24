#include "app/MainComponent.h"

#include "audio/AnalysisWorker.h"
#include "audio/AudioEngine.h"
#include "audio/MusicMath.h"

namespace ft
{

namespace
{
    // Noten gehen mit 60 Hz raus (geringe Zusatzlatenz), Pegel und Tonhoehe mit 30 Hz
    constexpr int timerRateHz = 60;
    constexpr int levelEveryNthTick = 2;
    const juce::String devServerUrl = "http://localhost:5173";
}

MainComponent::MainComponent (AudioEngine& e, AnalysisWorker& a, Settings& s, PluginRack& p)
    : engine (e), analysis (a), bridge (e, a, s, p)
{
    browser = std::make_unique<juce::WebBrowserComponent> (createBrowserOptions());
    addAndMakeVisible (*browser);

    bridge.setEventSink ([this] (const juce::Identifier& id, const juce::var& payload)
    {
        if (browser != nullptr)
            browser->emitEventIfBrowserIsVisible (id, payload);
    });
    bridge.reevaluateCalibration();

    // Soundfont fuer die Liedwiedergabe: gewaehlter, sonst der eingebaute aus dem UI-Paket
    bridge.initSoundFont ([this]
    {
        const auto sf = uiResources.getResource ("soundfont/sonivox.sf2");
        return sf.has_value() && engine.getSongPlayer().loadSoundFont (sf->data.data(), static_cast<int> (sf->data.size()));
    });

   #if FT_UI_DEV_SERVER
    browser->goToURL (devServerUrl);
   #else
    browser->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setSize (1100, 760);
    startTimerHz (timerRateHz);
}

MainComponent::~MainComponent()
{
    stopTimer();
}

juce::WebBrowserComponent::Options MainComponent::createBrowserOptions()
{
    auto userData = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                        .getChildFile ("FretboardTrainer")
                        .getChildFile ("WebView2");

    auto options = juce::WebBrowserComponent::Options {}
                       .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
                       .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
                                                    .withUserDataFolder (userData)
                                                    .withStatusBarDisabled()
                                                    .withBackgroundColour (juce::Colour (0xff111318)))
                       .withNativeIntegrationEnabled()
                       .withKeepPageLoadedWhenBrowserIsHidden()
                       .withResourceProvider ([this] (const juce::String& url) { return uiResources.getResource (url); });

    return bridge.registerFunctions (std::move (options));
}

void MainComponent::resized()
{
    browser->setBounds (getLocalBounds());
}

void MainComponent::timerCallback()
{
    NoteEvent ev;
    while (analysis.popNote (ev))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("midi", ev.midi);
        obj->setProperty ("cents", ev.cents);
        obj->setProperty ("timeMs", ev.timeSec * 1000.0);
        obj->setProperty ("onsetType", ev.onsetType == OnsetType::pick ? "pick" : "legato");
        obj->setProperty ("corrected", ev.corrected);
        obj->setProperty ("levelDb", ev.levelDb);
        obj->setProperty ("riseDb", ev.riseDb);
        browser->emitEventIfBrowserIsVisible ("note", juce::var (obj));
    }

    Analyzer::ChordEvent chord;
    while (analysis.popChord (chord))
    {
        juce::Array<juce::var> tones;
        for (int i = 0; i < chord.count; ++i)
        {
            const auto& t = chord.tones[static_cast<size_t> (i)];
            auto* tone = new juce::DynamicObject();
            tone->setProperty ("midi", t.midi);
            tone->setProperty ("present", t.present);
            tone->setProperty ("strength", t.strength);
            tone->setProperty ("shared", t.shared);
            tones.add (juce::var (tone));
        }
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("timeMs", chord.timeSec * 1000.0);
        obj->setProperty ("tones", tones);
        browser->emitEventIfBrowserIsVisible ("chord", juce::var (obj));
    }

    double onsetSec = 0.0;
    while (analysis.popOnset (onsetSec))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("timeMs", onsetSec * 1000.0);
        browser->emitEventIfBrowserIsVisible ("onset", juce::var (obj));
    }

    BeatEvent beat;
    while (engine.popBeat (beat))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("index", static_cast<juce::int64> (beat.index));
        obj->setProperty ("timeMs", 1000.0 * static_cast<double> (beat.sample) / juce::jmax (1.0, engine.getSampleRate()));
        obj->setProperty ("accent", beat.accent);
        obj->setProperty ("latencyMs", engine.getRoundTripLatencyMs());
        browser->emitEventIfBrowserIsVisible ("beat", juce::var (obj));
    }

    emitSongPosition();

    if (++tick % levelEveryNthTick == 0)
        emitLevelAndPitch();
}

void MainComponent::emitSongPosition()
{
    const auto s = engine.getSongPlayer().getStatus();
    // nur waehrend der Wiedergabe und einmal nach jeder Zustandsaenderung
    const auto key = (s.playing ? 1 : 0) | (s.halted ? 2 : 0) | (s.countIn ? 4 : 0) | (s.finished ? 8 : 0) | (s.pass << 4);
    if (! s.playing && key == lastSongStatusKey)
        return;
    lastSongStatusKey = key;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("tick", s.tick);
    obj->setProperty ("streamMs", 1000.0 * static_cast<double> (s.streamSample) / juce::jmax (1.0, engine.getSampleRate()));
    obj->setProperty ("playing", s.playing);
    obj->setProperty ("halted", s.halted);
    obj->setProperty ("countIn", s.countIn);
    obj->setProperty ("finished", s.finished);
    obj->setProperty ("pass", s.pass);
    obj->setProperty ("released", s.released);
    obj->setProperty ("latencyMs", engine.getRoundTripLatencyMs());
    browser->emitEventIfBrowserIsVisible ("songPosition", juce::var (obj));
}

void MainComponent::emitLevelAndPitch()
{
    levels.reset();
    engine.drainLevels (levels);

    auto* level = new juce::DynamicObject();
    level->setProperty ("rmsDb", levels.getRmsDb());
    level->setProperty ("peakDb", levels.getPeakDb());
    level->setProperty ("gateOpen", levels.wasGateOpen());
    browser->emitEventIfBrowserIsVisible ("level", juce::var (level));

    const auto p = analysis.getLatestPitch();
    auto* pitch = new juce::DynamicObject();

    if (p.voiced && p.hz > 0.0f)
    {
        const auto n = nearestNote (p.hz);
        pitch->setProperty ("hz", p.hz);
        pitch->setProperty ("midi", n.midi);
        pitch->setProperty ("cents", n.cents);
    }
    else
    {
        pitch->setProperty ("hz", 0.0);
        pitch->setProperty ("midi", -1);
        pitch->setProperty ("cents", 0.0);
    }

    pitch->setProperty ("confidence", p.confidence);
    browser->emitEventIfBrowserIsVisible ("pitch", juce::var (pitch));
}

} // namespace ft
