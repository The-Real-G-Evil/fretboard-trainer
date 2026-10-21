#pragma once

#include "app/Bridge.h"
#include "app/UiResources.h"
#include "audio/LevelMeter.h"

#include <juce_gui_extra/juce_gui_extra.h>

namespace ft
{

class AudioEngine;
class Settings;

/** Haelt die WebView mit der Oberflaeche und sendet Pegel-Events an sie. */
class MainComponent : public juce::Component,
                      private juce::Timer
{
public:
    MainComponent (AudioEngine& engine, Settings& settings);
    ~MainComponent() override;

    void resized() override;

private:
    void timerCallback() override;
    juce::WebBrowserComponent::Options createBrowserOptions();

    AudioEngine& engine;
    Bridge bridge;
    UiResources uiResources;
    LevelAccumulator levels;

    std::unique_ptr<juce::WebBrowserComponent> browser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};

} // namespace ft
