#pragma once

#include "app/Bridge.h"
#include "app/UiResources.h"
#include "audio/LevelMeter.h"

#include <juce_gui_extra/juce_gui_extra.h>

namespace ft
{

class AnalysisWorker;
class AudioEngine;
class PluginRack;
class Settings;
class SettingsWindow;

/** Haelt die WebView mit der Oberflaeche und sendet Pegel-, Tonhoehen- und Noten-Events an sie.
    Besitzt auch das Einstellungsfenster (zweite WebView mit derselben Oberflaeche, ?view=settings);
    beide haengen an derselben Bridge und bekommen alle Events. */
class MainComponent : public juce::Component,
                      private juce::Timer,
                      private juce::DarkModeSettingListener
{
public:
    MainComponent (AudioEngine& engine, AnalysisWorker& analysis, Settings& settings, PluginRack& plugins);
    ~MainComponent() override;

    void resized() override;

    /** Einstellungsfenster zeigen und nach vorn holen; tab leer = zuletzt gezeigter Reiter. */
    void showSettings (const juce::String& tab = {});
    /** Sprache der Oberflaeche geaendert (Menue der App neu beschriften). */
    std::function<void()> onLanguageChanged;
    /** "de" oder "en" laut Einstellungen der Oberflaeche. */
    juce::String getLanguage() const;

    /** Erscheinungsbild anwenden (Titelleisten, Fensterhintergruende); auch nach dem Oeffnen des Fensters. */
    void applyAppearance();

private:
    void emit (const juce::Identifier& id, const juce::var& payload);
    void darkModeSettingChanged() override { applyAppearance(); }
    bool isDark() const;
    void timerCallback() override;
    void emitLevelAndPitch();
    void emitSongPosition();
    juce::WebBrowserComponent::Options createBrowserOptions();

    AudioEngine& engine;
    AnalysisWorker& analysis;
    Settings& settings;
    const juce::File dataDirectory;
    int tick = 0;
    int lastSongStatusKey = -1;
    Bridge bridge;
    UiResources uiResources;
    LevelAccumulator levels;

    std::unique_ptr<juce::WebBrowserComponent> browser;
    std::unique_ptr<SettingsWindow> settingsWindow;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};

} // namespace ft
