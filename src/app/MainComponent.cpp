#include "app/MainComponent.h"
#include "app/NativeAppearance.h"
#include "app/Settings.h"

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

    /** Laedt nur die eigene Oberflaeche: jede geladene Seite bekaeme sonst Zugriff auf alle Bridge-Funktionen
        (z. B. Dateien lesen). Neue Fenster verwirft JUCE ohnehin. */
    class UiBrowser : public juce::WebBrowserComponent
    {
    public:
        using juce::WebBrowserComponent::WebBrowserComponent;

        bool pageAboutToLoad (const juce::String& newURL) override
        {
           #if FT_UI_DEV_SERVER
            if (newURL.startsWith (devServerUrl + "/"))
                return true;
           #endif
            return newURL.startsWith (getResourceProviderRoot());
        }
    };

    juce::String settingsTitle (const juce::String& lang)
    {
        return lang == "en" ? juce::String ("Settings") : juce::String ("Einstellungen");
    }
}

/** Natives Einstellungsfenster: Titelleiste des Systems, nicht modal, Schliessen blendet nur aus. */
class SettingsWindow : public juce::DocumentWindow
{
public:
    SettingsWindow (const juce::String& title, std::unique_ptr<juce::WebBrowserComponent> b)
        : DocumentWindow (title,
                          juce::Desktop::getInstance().isDarkModeActive() ? juce::Colour (0xff1e1e1e) : juce::Colour (0xffececec),
                          DocumentWindow::closeButton),
          browser (b.get())
    {
        setUsingNativeTitleBar (true);
        setContentOwned (b.release(), false);
        setResizable (true, false);
        setResizeLimits (560, 420, 3000, 3000);
        centreWithSize (820, 680);
    }

    void closeButtonPressed() override { setVisible (false); }

    juce::WebBrowserComponent& getBrowser() noexcept { return *browser; }

private:
    juce::WebBrowserComponent* browser; // gehoert dem Fenster (Inhalt)

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SettingsWindow)
};

MainComponent::MainComponent (AudioEngine& e, AnalysisWorker& a, Settings& s, PluginRack& p)
    : engine (e), analysis (a), settings (s), dataDirectory (s.getDataDirectory()), bridge (e, a, s, p)
{
    browser = std::make_unique<UiBrowser> (createBrowserOptions());
    addAndMakeVisible (*browser);

    bridge.setEventSink ([this] (const juce::Identifier& id, const juce::var& payload) { emit (id, payload); });
    bridge.onOpenSettings = [this] (const juce::String& tab) { showSettings (tab); };
    bridge.onAppearanceChanged = [this] { applyAppearance(); };
    juce::Desktop::getInstance().addDarkModeSettingListener (this);
    bridge.onLanguageChanged = [this]
    {
        if (settingsWindow != nullptr)
            settingsWindow->setName (settingsTitle (getLanguage()));
        if (onLanguageChanged)
            onLanguageChanged();
    };
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
    juce::Desktop::getInstance().removeDarkModeSettingListener (this);
    settingsWindow = nullptr; // WebView vor der Bridge abbauen
}

void MainComponent::emit (const juce::Identifier& id, const juce::var& payload)
{
    if (browser != nullptr)
        browser->emitEventIfBrowserIsVisible (id, payload);
    if (settingsWindow != nullptr && settingsWindow->isVisible())
        settingsWindow->getBrowser().emitEventIfBrowserIsVisible (id, payload);
}

bool MainComponent::isDark() const
{
    const auto mode = settings.getUiSettings().getProperty ("appearance", "auto").toString();
    return mode == "dark" || (mode != "light" && juce::Desktop::getInstance().isDarkModeActive());
}

void MainComponent::applyAppearance()
{
    const auto mode = settings.getUiSettings().getProperty ("appearance", "auto").toString();
    setNativeAppearance (mode == "light" || mode == "dark" ? mode.toRawUTF8() : "auto");

    // Hintergrund der Fenster (sichtbar beim Aufziehen, bevor die WebView nachzeichnet)
    const auto dark = isDark();
    if (auto* w = findParentComponentOfClass<juce::DocumentWindow>())
        w->setBackgroundColour (dark ? juce::Colour (0xff111318) : juce::Colour (0xfff4f5f7));
    if (settingsWindow != nullptr)
        settingsWindow->setBackgroundColour (dark ? juce::Colour (0xff1e1e1e) : juce::Colour (0xffececec));
}

juce::String MainComponent::getLanguage() const
{
    return settings.getUiSettings().getProperty ("language", "de").toString() == "en" ? "en" : "de";
}

void MainComponent::showSettings (const juce::String& tab)
{
    const auto wanted = tab.containsOnly ("abcdefghijklmnopqrstuvwxyz") ? tab : juce::String();

    if (settingsWindow == nullptr)
    {
        auto b = std::make_unique<UiBrowser> (createBrowserOptions());
        const auto query = "?view=settings" + (wanted.isNotEmpty() ? "&tab=" + wanted : juce::String());
       #if FT_UI_DEV_SERVER
        b->goToURL (devServerUrl + "/" + query);
       #else
        b->goToURL (juce::WebBrowserComponent::getResourceProviderRoot() + query);
       #endif
        settingsWindow = std::make_unique<SettingsWindow> (settingsTitle (getLanguage()), std::move (b));
        applyAppearance();
        settingsWindow->setVisible (true);
    }
    else
    {
        settingsWindow->setVisible (true);
        // War ausgeblendet und hat keine Events bekommen: Stand neu lesen, gewuenschten Reiter zeigen
        auto* changed = new juce::DynamicObject();
        changed->setProperty ("from", "core");
        settingsWindow->getBrowser().emitEventIfBrowserIsVisible ("settingsChanged", juce::var (changed));
        if (wanted.isNotEmpty())
        {
            auto* t = new juce::DynamicObject();
            t->setProperty ("tab", wanted);
            settingsWindow->getBrowser().emitEventIfBrowserIsVisible ("settingsTab", juce::var (t));
        }
    }

    settingsWindow->toFront (true);
}

juce::WebBrowserComponent::Options MainComponent::createBrowserOptions()
{
    auto options = juce::WebBrowserComponent::Options {}
                       .withNativeIntegrationEnabled()
                       .withKeepPageLoadedWhenBrowserIsHidden()
                       .withResourceProvider ([this] (const juce::String& url) { return uiResources.getResource (url); });

   #if JUCE_WINDOWS
    // Windows: WebView2 (Edge); macOS und Linux nehmen WebKit des Systems
    const auto userData = dataDirectory.getChildFile ("WebView2");
    options = options.withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
                     .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
                                                  .withUserDataFolder (userData)
                                                  .withStatusBarDisabled()
                                                  .withBackgroundColour (juce::Colour (0xff111318)));
   #endif

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
        emit ("note", juce::var (obj));
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
        emit ("chord", juce::var (obj));
    }

    double onsetSec = 0.0;
    while (analysis.popOnset (onsetSec))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("timeMs", onsetSec * 1000.0);
        emit ("onset", juce::var (obj));
    }

    double offSec = 0.0;
    while (analysis.popNoteOff (offSec))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("timeMs", offSec * 1000.0);
        emit ("noteOff", juce::var (obj));
    }

    BeatEvent beat;
    while (engine.popBeat (beat))
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("index", static_cast<juce::int64> (beat.index));
        obj->setProperty ("timeMs", 1000.0 * static_cast<double> (beat.sample) / juce::jmax (1.0, engine.getSampleRate()));
        obj->setProperty ("accent", beat.accent);
        obj->setProperty ("latencyMs", engine.getRoundTripLatencyMs());
        emit ("beat", juce::var (obj));
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
    emit ("songPosition", juce::var (obj));
}

void MainComponent::emitLevelAndPitch()
{
    levels.reset();
    engine.drainLevels (levels);

    auto* level = new juce::DynamicObject();
    level->setProperty ("rmsDb", levels.getRmsDb());
    level->setProperty ("peakDb", levels.getPeakDb());
    level->setProperty ("gateOpen", levels.wasGateOpen());
    emit ("level", juce::var (level));

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
    emit ("pitch", juce::var (pitch));
}

} // namespace ft
