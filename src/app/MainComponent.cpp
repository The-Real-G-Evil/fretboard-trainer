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

MainComponent::MainComponent (AudioEngine& e, AnalysisWorker& a, Settings& s)
    : engine (e), analysis (a), bridge (e, a, s)
{
    browser = std::make_unique<juce::WebBrowserComponent> (createBrowserOptions());
    addAndMakeVisible (*browser);

    bridge.setEventSink ([this] (const juce::Identifier& id, const juce::var& payload)
    {
        if (browser != nullptr)
            browser->emitEventIfBrowserIsVisible (id, payload);
    });
    bridge.reevaluateCalibration();

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

    if (++tick % levelEveryNthTick == 0)
        emitLevelAndPitch();
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
