#include "app/PluginRack.h"

namespace ft
{

// ---------- Plugin-Fenster

struct PluginRack::EditorWindow : public juce::DocumentWindow
{
    EditorWindow (const juce::String& title, juce::AudioProcessorEditor* editor, std::function<void()> onClose)
        : DocumentWindow (title, juce::Colour (0xff1a1d24), DocumentWindow::closeButton | DocumentWindow::minimiseButton),
          closed (std::move (onClose))
    {
        setUsingNativeTitleBar (true);
        setContentOwned (editor, true);
        setResizable (editor->isResizable(), false);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);
        toFront (true);
    }

    void closeButtonPressed() override
    {
        if (closed)
            closed(); // loescht das Fenster
    }

    std::function<void()> closed;
};

// ---------- Rack

PluginRack::PluginRack (const juce::File& dataDirectory)
    : listFile (dataDirectory.getChildFile ("plugins.xml")),
      crashFile (dataDirectory.getChildFile ("plugin-scan.crash"))
{
    formats.addFormat (std::make_unique<juce::VST3PluginFormat>());

    if (const auto xml = juce::parseXML (listFile))
    {
        known.recreateFromXml (*xml);
        scanned = true;
    }
    startTimer (1000);
}

PluginRack::~PluginRack()
{
    alive->store (false);
    stopTimer();
    for (auto& s : slots)
        s.window = nullptr; // Oberflaechen vor den Plugins schliessen
    slots.clear();
    delete pending.exchange (nullptr);
    delete retired.exchange (nullptr);
    delete current;
    current = nullptr;
    collectGarbage();
}

juce::Array<juce::PluginDescription> PluginRack::getAvailable() const
{
    juce::Array<juce::PluginDescription> out;
    for (const auto& d : known.getTypes())
        if (! d.isInstrument)
            out.add (d);
    std::sort (out.begin(), out.end(), [] (const auto& a, const auto& b)
    {
        return a.name.compareIgnoreCase (b.name) < 0;
    });
    return out;
}

void PluginRack::saveList() const
{
    if (const auto xml = known.createXml())
        xml->writeTo (listFile);
}

void PluginRack::scan (std::function<void (float, juce::String)> progress, std::function<void()> done)
{
    if (scanning.exchange (true))
        return;

    auto* format = formats.getFormat (0);
    auto stillAlive = alive;
    juce::Thread::launch ([this, stillAlive, format, progress = std::move (progress), done = std::move (done)]
    {
        // Abstuerzende Plugins landen ueber die Datei crashFile beim naechsten Mal auf der Sperrliste
        juce::PluginDirectoryScanner scanner (known, *format, format->getDefaultLocationsToSearch(), true, crashFile, false);
        juce::String next;
        while (stillAlive->load())
        {
            next = scanner.getNextPluginFileThatWillBeScanned();
            const auto p = scanner.getProgress();
            juce::MessageManager::callAsync ([stillAlive, progress, p, name = juce::File (next).getFileNameWithoutExtension()]
            {
                if (stillAlive->load() && progress)
                    progress (p, name);
            });
            if (! scanner.scanNextFile (true, next))
                break;
        }
        juce::MessageManager::callAsync ([this, stillAlive, done]
        {
            if (! stillAlive->load())
                return;
            scanned = true;
            scanning = false;
            saveList();
            if (done)
                done();
        });
    });
}

void PluginRack::prepareProcessor (juce::AudioProcessor& p)
{
    // Hauptbus stereo (sonst Mono-Eingang), Nebenbusse (Sidechain) aus
    auto layoutWith = [&p] (const juce::AudioChannelSet& in, const juce::AudioChannelSet& out)
    {
        auto layout = p.getBusesLayout();
        for (auto& b : layout.inputBuses)
            b = juce::AudioChannelSet::disabled();
        for (auto& b : layout.outputBuses)
            b = juce::AudioChannelSet::disabled();
        if (! layout.inputBuses.isEmpty())
            layout.inputBuses.getReference (0) = in;
        if (! layout.outputBuses.isEmpty())
            layout.outputBuses.getReference (0) = out;
        return layout;
    };
    const auto stereo = juce::AudioChannelSet::stereo(), mono = juce::AudioChannelSet::mono();
    for (const auto& layout : { layoutWith (stereo, stereo), layoutWith (mono, stereo), layoutWith (mono, mono) })
        if (p.checkBusesLayoutSupported (layout) && p.setBusesLayout (layout))
            break;

    p.setNonRealtime (false);
    p.setPlayHead (nullptr);
    p.prepareToPlay (rate, blockSize);
}

void PluginRack::insertSlot (std::shared_ptr<juce::AudioProcessor> processor, const juce::PluginDescription& desc, bool enabled)
{
    {
        const std::lock_guard<std::mutex> lock (prepareLock);
        prepareProcessor (*processor);
    }
    Slot s;
    s.processor = std::move (processor);
    s.desc = desc;
    s.enabled = enabled;
    slots.push_back (std::move (s));
    publish();
}

void PluginRack::addProcessor (std::unique_ptr<juce::AudioProcessor> processor, const juce::PluginDescription& desc)
{
    insertSlot (std::shared_ptr<juce::AudioProcessor> (std::move (processor)), desc, true);
    changed();
}

void PluginRack::add (const juce::String& id, std::function<void (juce::String)> done)
{
    const auto desc = known.getTypeForIdentifierString (id);
    if (desc == nullptr)
        return done ("Plugin nicht in der Liste – bitte erneut suchen.");

    auto stillAlive = alive;
    formats.createPluginInstanceAsync (*desc, rate, blockSize,
        [this, stillAlive, d = *desc, done] (std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
    {
        if (! stillAlive->load())
            return;
        if (instance == nullptr)
            return done (error.isNotEmpty() ? error : juce::String ("Plugin konnte nicht geladen werden."));
        insertSlot (std::shared_ptr<juce::AudioProcessor> (std::move (instance)), d, true);
        changed();
        done ({});
    });
}

void PluginRack::remove (int slot)
{
    if (slot < 0 || slot >= static_cast<int> (slots.size()))
        return;
    slots[static_cast<size_t> (slot)].window = nullptr;
    slots.erase (slots.begin() + slot); // das Plugin selbst lebt bis zum Abraeumen des Schnappschusses
    publish();
    changed();
}

void PluginRack::move (int slot, int delta)
{
    const auto to = slot + delta;
    if (slot < 0 || to < 0 || slot >= static_cast<int> (slots.size()) || to >= static_cast<int> (slots.size()))
        return;
    std::swap (slots[static_cast<size_t> (slot)], slots[static_cast<size_t> (to)]);
    publish();
    changed();
}

void PluginRack::setEnabled (int slot, bool enabled)
{
    if (slot < 0 || slot >= static_cast<int> (slots.size()))
        return;
    slots[static_cast<size_t> (slot)].enabled = enabled;
    publish();
    changed();
}

void PluginRack::openEditor (int slot)
{
    if (slot < 0 || slot >= static_cast<int> (slots.size()))
        return;
    auto& s = slots[static_cast<size_t> (slot)];
    if (s.window != nullptr)
    {
        s.window->toFront (true);
        return;
    }
    auto* editor = s.processor->hasEditor() ? s.processor->createEditorAndMakeActive() : nullptr;
    if (editor == nullptr)
        editor = new juce::GenericAudioProcessorEditor (*s.processor);

    auto* processor = s.processor.get();
    s.window = std::make_unique<EditorWindow> (s.desc.name, editor, [this, processor]
    {
        // Fenster schliessen: Zustand des Plugins speichern lassen
        for (auto& other : slots)
            if (other.processor.get() == processor)
                other.window = nullptr;
        changed();
    });
}

std::vector<PluginRack::SlotInfo> PluginRack::getSlots() const
{
    std::vector<SlotInfo> out;
    for (const auto& s : slots)
        out.push_back ({ s.desc.name, s.desc.manufacturerName, s.enabled, s.processor->getLatencySamples(), s.processor->hasEditor() });
    return out;
}

int PluginRack::getLatencySamples() const
{
    int total = 0;
    for (const auto& s : slots)
        if (s.enabled)
            total += s.processor->getLatencySamples();
    return total;
}

juce::var PluginRack::saveState() const
{
    juce::Array<juce::var> out;
    for (const auto& s : slots)
    {
        juce::MemoryBlock state;
        s.processor->getStateInformation (state);
        auto* o = new juce::DynamicObject();
        if (const auto xml = s.desc.createXml())
            o->setProperty ("desc", xml->toString (juce::XmlElement::TextFormat().singleLine().withoutHeader()));
        o->setProperty ("enabled", s.enabled);
        o->setProperty ("state", state.toBase64Encoding());
        out.add (juce::var (o));
    }
    return out;
}

void PluginRack::restoreState (const juce::var& state, std::function<void()> done)
{
    // nacheinander laden, damit die Reihenfolge erhalten bleibt
    auto queue = std::make_shared<juce::Array<juce::var>>();
    if (const auto* arr = state.getArray())
        queue->addArray (*arr);

    auto stillAlive = alive;
    auto step = std::make_shared<std::function<void()>>();
    *step = [this, stillAlive, queue, step, done]
    {
        if (queue->isEmpty())
        {
            *step = nullptr; // Kreisbezug aufloesen
            if (done)
                done();
            return;
        }
        const auto item = queue->removeAndReturn (0);
        juce::PluginDescription desc;
        const auto xml = juce::parseXML (item.getProperty ("desc", {}).toString());
        if (xml == nullptr || ! desc.loadFromXml (*xml))
            return (*step)();

        formats.createPluginInstanceAsync (desc, rate, blockSize,
            [this, stillAlive, item, desc, step] (std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
        {
            if (! stillAlive->load())
                return;
            if (instance != nullptr)
            {
                juce::MemoryBlock mb;
                if (mb.fromBase64Encoding (item.getProperty ("state", {}).toString()) && mb.getSize() > 0)
                    instance->setStateInformation (mb.getData(), static_cast<int> (mb.getSize()));
                insertSlot (std::shared_ptr<juce::AudioProcessor> (std::move (instance)), desc,
                            static_cast<bool> (item.getProperty ("enabled", true)));
            }
            else
            {
                juce::Logger::writeToLog ("Plugin " + desc.name + " nicht geladen: " + error);
            }
            (*step)();
        });
    };
    (*step)();
}

void PluginRack::publish()
{
    auto* snap = new Snapshot();
    {
        const std::lock_guard<std::mutex> lock (prepareLock);
        int channels = 2;
        for (const auto& s : slots)
        {
            if (! s.enabled)
                continue;
            Entry e;
            e.processor = s.processor.get();
            e.inputs = s.processor->getTotalNumInputChannels();
            e.outputs = s.processor->getTotalNumOutputChannels();
            channels = std::max ({ channels, e.inputs, e.outputs });
            snap->entries.push_back (e);
            snap->keepAlive.push_back (s.processor);
        }
        snap->buffer.setSize (channels, std::max (1, blockSize));
        snap->midi.ensureSize (256);
        if (auto* old = pending.exchange (snap, std::memory_order_acq_rel))
            graveyard.push_back (old); // nie abgeholt
    }
}

void PluginRack::collectGarbage()
{
    std::vector<Snapshot*> dead;
    {
        const std::lock_guard<std::mutex> lock (prepareLock);
        if (auto* r = retired.exchange (nullptr, std::memory_order_acq_rel))
            graveyard.push_back (r);
        dead.swap (graveyard);
    }
    for (auto* s : dead)
        delete s; // ggf. letzter Verweis auf ein entferntes Plugin: Zerstoerung auf dem Message-Thread
}

void PluginRack::prepareInsert (double sampleRate, int maxBlockSize)
{
    {
        const std::lock_guard<std::mutex> lock (prepareLock);
        rate = sampleRate;
        blockSize = maxBlockSize;
        for (const auto& s : slots)
            prepareProcessor (*s.processor);
    }
    publish(); // Puffer fuer die neue Blockgroesse
}

void PluginRack::processInsert (float* left, float* right, int n) noexcept
{
    if (retired.load (std::memory_order_acquire) == nullptr)
        if (auto* s = pending.exchange (nullptr, std::memory_order_acq_rel))
        {
            retired.store (current, std::memory_order_release);
            current = s;
        }

    if (current == nullptr || current->entries.empty() || n > current->buffer.getNumSamples())
        return;

    auto& buf = current->buffer;
    for (const auto& e : current->entries)
    {
        buf.setSize (buf.getNumChannels(), n, false, false, true);
        if (e.inputs >= 2)
        {
            buf.copyFrom (0, 0, left, n);
            buf.copyFrom (1, 0, right, n);
        }
        else
        {
            buf.copyFrom (0, 0, left, n, 0.5f);
            buf.addFrom (0, 0, right, n, 0.5f);
        }
        {
            const juce::ScopedLock sl (e.processor->getCallbackLock());
            if (e.processor->isSuspended())
                continue;
            e.processor->processBlock (buf, current->midi);
        }
        current->midi.clear();
        juce::FloatVectorOperations::copy (left, buf.getReadPointer (0), n);
        juce::FloatVectorOperations::copy (right, buf.getReadPointer (e.outputs >= 2 ? 1 : 0), n);
    }
}

} // namespace ft
