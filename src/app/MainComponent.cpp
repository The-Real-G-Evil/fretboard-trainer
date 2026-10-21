#include "app/MainComponent.h"

#include "audio/AudioEngine.h"

namespace ft
{

namespace
{
    constexpr int levelEventRateHz = 30;
    const juce::String devServerUrl = "http://localhost:5173";
}

MainComponent::MainComponent (AudioEngine& e, Settings& s)
    : engine (e), bridge (e, s)
{
    browser = std::make_unique<juce::WebBrowserComponent> (createBrowserOptions());
    addAndMakeVisible (*browser);

   #if FT_UI_DEV_SERVER
    browser->goToURL (devServerUrl);
   #else
    browser->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setSize (1100, 760);
    startTimerHz (levelEventRateHz);
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
    levels.reset();
    engine.drainLevels (levels);

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("rmsDb", levels.getRmsDb());
    obj->setProperty ("peakDb", levels.getPeakDb());
    obj->setProperty ("gateOpen", levels.wasGateOpen());

    browser->emitEventIfBrowserIsVisible ("level", juce::var (obj));
}

} // namespace ft
