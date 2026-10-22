#pragma once

#include "audio/SpscFifo.h"

#include <atomic>
#include <memory>
#include <vector>

struct tsf;

namespace ft
{

/** Liedwiedergabe im Audio-Thread (Song-Modus): spielt die MIDI-Daten eines Lieds ueber einen
    Soundfont (TinySoundFont) auf dem Ausgabebus der App – zusammen mit Mithoeren und Metronom und
    auf derselben Stream-Uhr wie die Erkennung.

    - Tempo aus der Tempokarte des Lieds, skaliert mit der Wiedergabegeschwindigkeit.
    - Wiedergabebereich mit Wiederholen, Vorzaehler und Metronom im Liedtempo (Klick je Viertel).
    - Warte-Modus: die Wiedergabe haelt an jedem Halte-Tick (Noten der eigenen Spur), bis die
      Oberflaeche ihn freigibt (setReleased) – sample-genau, ohne Umweg ueber die UI-Uhr.
    - Lautstaerke je MIDI-Kanal (Mischpult), zusaetzlich zu Kanal-Lautstaerke (CC 7) aus dem Lied.

    Steuerung aus dem UI-Thread ueber eine lock-freie Befehlsschlange; das Lied selbst wird ueber
    einen Zeiger uebergeben (setSong), der alte im UI-Thread freigegeben. Im Audio-Thread wird
    nichts alloziert (Stimmen und Kanaele des Synthesizers werden beim Laden reserviert).
*/
class SongPlayer
{
public:
    struct Event
    {
        long long tick = 0;
        unsigned char status = 0; ///< MIDI-Status inkl. Kanal (0x80, 0x90, 0xB0, 0xC0, 0xE0)
        unsigned char data1 = 0, data2 = 0;
    };

    struct Tempo
    {
        long long tick = 0;
        double bpm = 120.0; ///< Viertel je Minute
    };

    struct Song
    {
        int ppq = 960;
        std::vector<Event> events;   ///< nach Tick sortiert
        std::vector<Tempo> tempo;    ///< nach Tick sortiert, erster Eintrag bei 0
        std::vector<long long> haltTicks; ///< Warte-Modus: Noten der eigenen Spur, sortiert
    };

    struct Status
    {
        double tick = 0.0;            ///< Liedposition (Wiedergabe-Ticks)
        long long streamSample = 0;   ///< Stream-Sample, zu dem tick galt
        bool playing = false;         ///< laeuft (auch waehrend Vorzaehler und Halt)
        bool halted = false;          ///< Warte-Modus: haelt an einer Note
        bool countIn = false;         ///< Vorzaehler laeuft
        bool finished = false;        ///< Ende des Bereichs erreicht (ohne Wiederholen)
        int pass = 0;                 ///< Durchlauf (zaehlt bei jedem Wiederholen hoch)
        int released = 0;             ///< Warte-Modus: so viele Halte-Ticks sind freigegeben
    };

    SongPlayer();
    ~SongPlayer();

    // ---------- UI-Thread
    /** Soundfont (SF2) laden; bereitet Stimmen und 16 Kanaele vor. Ein spaeterer Aufruf tauscht den
        Soundfont auch waehrend der Wiedergabe aus (Uebergabe an den Audio-Thread ohne Sperre).
        Darf von einem Hintergrund-Thread kommen, aber nie gleichzeitig mit sich selbst. */
    bool loadSoundFont (const void* data, int size);
    bool hasSoundFont() const noexcept { return synthReady.load(); }

    /** Vor dem ersten process() und bei jeder Aenderung der Abtastrate (alloziert). */
    void prepare (double sampleRate, int maxBlockSize);

    /** Neues Lied (stoppt die Wiedergabe). Frueher uebergebene Lieder werden hier freigegeben. */
    void setSong (std::unique_ptr<Song> song);

    /** Andere Halte-Ticks (Warte-Modus) fuer das laufende Lied, z. B. nach einem Spurwechsel –
        ohne die Wiedergabe anzuhalten. */
    void setHaltTicks (std::vector<long long> ticks);

    void play (bool withCountIn);
    void pause();
    void seek (long long tick);
    void setSpeed (double speed);
    /** Wiedergabebereich; loop = wiederholen, passes = Anzahl der Durchlaeufe (0 = endlos).
        Steht die Wiedergabe ausserhalb des neuen Bereichs, springt sie an dessen Anfang. */
    void setRange (long long startTick, long long endTick, bool loop, int passes = 0);
    void setChannelGain (int channel, float gain);
    void setMetronome (bool on, float gain);
    void setWaitMode (bool on);
    /** Warte-Modus: die ersten n Halte-Ticks des Durchlaufs pass sind freigegeben. */
    void setReleased (int pass, int n);
    void setMasterGain (float gain);

    Status getStatus() const noexcept;

    // ---------- Audio-Thread
    /** Addiert die Wiedergabe (mono) in out; blockStart = Stream-Sample des ersten Samples. */
    void process (float* out, int numSamples, long long blockStart) noexcept;

private:
    enum class CommandType { play, pause, seek, speed, range, channelGain, metronome, waitMode, released, masterGain };

    struct Command
    {
        CommandType type = CommandType::pause;
        long long a = 0, b = 0;
        double x = 0.0;
        bool flag = false;
    };

    void push (const Command& c);
    void applyCommand (const Command& c) noexcept;
    void applyEvent (const Event& e) noexcept;
    void chaseTo (long long tick) noexcept;   ///< Programm/Controller bis tick nachholen, Noten aus
    void allNotesOff() noexcept;
    double ticksPerSample() const noexcept;
    double bpmAt (double tick) const noexcept;
    void renderSynth (float* out, int n) noexcept;
    void renderClicks (float* out, int n) noexcept;
    void publish (long long streamSample) noexcept;

    tsf* synth = nullptr;
    std::atomic<bool> synthReady { false };
    std::atomic<tsf*> pendingSynth { nullptr }, retiredSynth { nullptr };
    std::atomic<double> preparedRate { 48000.0 };
    double sampleRate = 48000.0;
    std::vector<float> scratch;

    // Lied: Uebergabe UI -> Audio ueber atomaren Zeiger, Freigabe im UI-Thread
    std::atomic<Song*> pendingSong { nullptr };
    std::atomic<Song*> retiredSong { nullptr };
    std::atomic<std::vector<long long>*> pendingHalts { nullptr }, retiredHalts { nullptr };
    Song* song = nullptr; // Audio-Thread

    SpscFifo<Command, 256> commands;

    // Audio-Thread-Zustand
    double tick = 0.0, speed = 1.0;
    long long rangeStart = 0, rangeEnd = -1;
    bool loop = false, playing = false, finished = false, waitMode = false;
    int loopPasses = 0;
    int pass = 0, released = 0;
    size_t nextEvent = 0, nextHalt = 0;
    double countInSamples = 0.0, countInBeatSamples = 0.0;
    bool metronomeOn = false;
    float metronomeGain = 0.3f, masterGain = 1.0f;
    float channelGain[16] {};
    float channelBaseVolume[16] {}; ///< Kanallautstaerke aus dem Lied (CC 7/11 nach der Kurve des Synthesizers)
    double nextClickTick = 0.0;
    int clickRemaining = 0;   ///< Samples des laufenden Klicks
    int clickLength = 0;
    double clickPhase = 0.0;
    bool clickAccent = false;

    std::atomic<double> statusTick { 0.0 };
    std::atomic<long long> statusSample { 0 };
    std::atomic<int> statusFlags { 0 }, statusPass { 0 }, statusReleased { 0 };
};

} // namespace ft
