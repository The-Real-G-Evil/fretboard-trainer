#include "app/MainComponent.h"
#include "app/PluginRack.h"
#include "app/Settings.h"
#include "audio/AnalysisWorker.h"
#include "audio/AudioEngine.h"

#include <juce_gui_basics/juce_gui_basics.h>

namespace ft
{

class MainWindow : public juce::DocumentWindow
{
public:
    MainWindow (const juce::String& name, AudioEngine& engine, AnalysisWorker& analysis, Settings& settings, PluginRack& plugins)
        : DocumentWindow (name, juce::Colour (0xff111318), DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        main = new MainComponent (engine, analysis, settings, plugins);
        setContentOwned (main, true);
        setResizable (true, false);
        setResizeLimits (720, 520, 4000, 3000);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);
    }

    void closeButtonPressed() override
    {
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }

    MainComponent& getMain() noexcept { return *main; }

private:
    MainComponent* main = nullptr; // Inhalt des Fensters

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainWindow)
};

/** macOS: Menueleiste nur mit dem App-Menue (dort "Einstellungen..." mit Cmd+,). */
class AppMenu : public juce::MenuBarModel
{
public:
    juce::StringArray getMenuBarNames() override { return {}; }
    juce::PopupMenu getMenuForIndex (int, const juce::String&) override { return {}; }
    void menuItemSelected (int, int) override {}
};

class FretboardTrainerApplication : public juce::JUCEApplication
{
public:
    enum CommandIds { showSettingsCommand = 0x2001 };

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
        engine->setEffects (settings->getEffects());

        const auto deviceState = settings->getAudioDeviceState();
        const auto error = engine->initialise (deviceState.get());

        if (error.isNotEmpty())
            juce::Logger::writeToLog ("Audio-Initialisierung: " + error);

        analysis = std::make_unique<AnalysisWorker> (*engine);
        analysis->setDetectionConfig (settings->getDetectionConfig());
        analysis->start();

        // VST3-Plugins im Mithoer-Weg: gespeicherte Kette laden, Aenderungen sofort sichern
        plugins = std::make_unique<PluginRack> (settings->getDataDirectory());
        engine->setInsert (plugins.get());
        plugins->onChange = [this] { savePlugins(); };
        plugins->restoreState (juce::JSON::parse (rackFile()));

        mainWindow = std::make_unique<MainWindow> (getApplicationName(), *engine, *analysis, *settings, *plugins);

        // Einstellungen: macOS ueber das App-Menue (Cmd+,), Windows/Linux ueber Zahnrad und Strg+, in der Oberflaeche
        commands.registerAllCommandsForTarget (this);
        mainWindow->addKeyListener (commands.getKeyMappings());
        mainWindow->getMain().onLanguageChanged = [this] { rebuildMenu(); };
        mainWindow->getMain().applyAppearance(); // gespeichertes Erscheinungsbild gleich beim Start
        rebuildMenu();
    }

    juce::String settingsLabel() const
    {
        return mainWindow != nullptr && mainWindow->getMain().getLanguage() == "en"
                 ? juce::String (juce::CharPointer_UTF8 ("Settings\xe2\x80\xa6"))
                 : juce::String (juce::CharPointer_UTF8 ("Einstellungen\xe2\x80\xa6"));
    }

    void rebuildMenu()
    {
       #if JUCE_MAC
        commands.commandStatusChanged(); // neue Beschriftung aus getCommandInfo
        juce::PopupMenu extra;
        extra.addCommandItem (&commands, showSettingsCommand, settingsLabel());
        juce::MenuBarModel::setMacMainMenu (&appMenu, &extra);
       #endif
    }

    void getAllCommands (juce::Array<juce::CommandID>& ids) override
    {
        JUCEApplication::getAllCommands (ids);
        ids.add (showSettingsCommand);
    }

    void getCommandInfo (juce::CommandID id, juce::ApplicationCommandInfo& info) override
    {
        if (id == showSettingsCommand)
        {
            info.setInfo (settingsLabel(), {}, "App", 0);
            info.addDefaultKeypress (',', juce::ModifierKeys::commandModifier);
            return;
        }
        JUCEApplication::getCommandInfo (id, info);
    }

    bool perform (const InvocationInfo& info) override
    {
        if (info.commandID == showSettingsCommand)
        {
            if (mainWindow != nullptr)
                mainWindow->getMain().showSettings();
            return true;
        }
        return JUCEApplication::perform (info);
    }

    void shutdown() override
    {
       #if JUCE_MAC
        juce::MenuBarModel::setMacMainMenu (nullptr);
       #endif
        mainWindow = nullptr;
        analysis = nullptr; // stoppt den Analyse-Thread vor der AudioEngine

        if (plugins != nullptr)
        {
            savePlugins();            // Zustand der Plugins (auch bei offenem Plugin-Fenster)
            engine->setInsert (nullptr); // wartet, bis der Audio-Thread die Plugins nicht mehr benutzt
            plugins = nullptr;
        }

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
    juce::File rackFile() const { return settings->getDataDirectory().getChildFile ("plugin-rack.json"); }
    void savePlugins() const
    {
        if (plugins != nullptr)
            rackFile().replaceWithText (juce::JSON::toString (plugins->saveState(), true));
    }

    juce::ApplicationCommandManager commands;
    AppMenu appMenu;
    std::unique_ptr<PluginRack> plugins;
    std::unique_ptr<Settings> settings;
    std::unique_ptr<AudioEngine> engine;
    std::unique_ptr<AnalysisWorker> analysis;
    std::unique_ptr<MainWindow> mainWindow;
};

} // namespace ft

START_JUCE_APPLICATION (ft::FretboardTrainerApplication)
