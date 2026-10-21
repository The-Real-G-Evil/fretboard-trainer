#include "app/MainComponent.h"
#include "app/Settings.h"
#include "audio/AudioEngine.h"

#include <juce_gui_basics/juce_gui_basics.h>

namespace ft
{

class MainWindow : public juce::DocumentWindow
{
public:
    MainWindow (const juce::String& name, AudioEngine& engine, Settings& settings)
        : DocumentWindow (name, juce::Colour (0xff111318), DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new MainComponent (engine, settings), true);
        setResizable (true, false);
        setResizeLimits (720, 520, 4000, 3000);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);
    }

    void closeButtonPressed() override
    {
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainWindow)
};

class FretboardTrainerApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return JUCE_APPLICATION_NAME_STRING; }
    const juce::String getApplicationVersion() override { return JUCE_APPLICATION_VERSION_STRING; }
    bool moreThanOneInstanceAllowed() override          { return false; }

    void initialise (const juce::String&) override
    {
        settings = std::make_unique<Settings>();
        engine   = std::make_unique<AudioEngine>();

        engine->setInputGainDb (settings->getInputGainDb());
        engine->setMonitoring (settings->getMonitoringOn(), settings->getMonitorVolumeDb());
        engine->setNoiseGate (settings->getNoiseGate());

        const auto deviceState = settings->getAudioDeviceState();
        const auto error = engine->initialise (deviceState.get());

        if (error.isNotEmpty())
            juce::Logger::writeToLog ("Audio-Initialisierung: " + error);

        mainWindow = std::make_unique<MainWindow> (getApplicationName(), *engine, *settings);
    }

    void shutdown() override
    {
        mainWindow = nullptr;

        if (engine != nullptr)
        {
            const auto xml = engine->createDeviceStateXml();
            settings->setAudioDeviceState (xml.get());
            engine->shutdown();
        }

        settings->saveNow();
        engine   = nullptr;
        settings = nullptr;
    }

    void systemRequestedQuit() override { quit(); }

private:
    std::unique_ptr<Settings> settings;
    std::unique_ptr<AudioEngine> engine;
    std::unique_ptr<MainWindow> mainWindow;
};

} // namespace ft

START_JUCE_APPLICATION (ft::FretboardTrainerApplication)
