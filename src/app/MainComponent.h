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

/** Haelt die WebView mit der Oberflaeche und sendet Pegel-, Tonhoehen- und Noten-Events an sie. */
class MainComponent : public juce::Component,
                      private juce::Timer
{
public:
    MainComponent (AudioEngine& engine, AnalysisWorker& analysis, Settings& settings, PluginRack& plugins);
    ~MainComponent() override;

    void resized() override;

private:
    void timerCallback() override;
    void emitLevelAndPitch();
    void emitSongPosition();
    juce::WebBrowserComponent::Options createBrowserOptions();

    AudioEngine& engine;
    AnalysisWorker& analysis;
    int tick = 0;
    int lastSongStatusKey = -1;
    Bridge bridge;
    UiResources uiResources;
    LevelAccumulator levels;

    std::unique_ptr<juce::WebBrowserComponent> browser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};

} // namespace ft
