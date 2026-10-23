#pragma once

#include "app/CalibrationStore.h"
#include "app/PluginRack.h"
#include "app/ReviewStore.h"
#include "stats/StatsDb.h"

#include <juce_gui_extra/juce_gui_extra.h>

#include <atomic>
#include <functional>
#include <set>

namespace ft
{

class AnalysisWorker;
class AudioEngine;
class Settings;

/** Native Funktionen fuer die Web-Oberflaeche (SPEC Abschnitt 9, Teilmenge).

    UI -> Kern:
      getAudioDevices()                    -> DeviceInfo
      setAudioDevice(cfg)                  -> DeviceInfo (+ error)
      setInputGain(db)
      setMonitoring(on, volumeDb)
      setNoiseGate({thresholdDb, attackMs, holdMs, releaseMs, hysteresisDb})
      setInstrument({id, minHz, maxHz})    -> Settings; laedt das Profil des Instruments
                                              (Tonbereich + Erkennungsparameter), minHz/maxHz
                                              sind die Standardwerte fuer ein neues Profil
      setDetectionConfig({minHz, maxHz, centsTolerance})   Tonbereich des aktuellen Instruments
      getSettings()                        -> { instrument, inputGainDb, monitoring, noiseGate, detection }
      getUiSettings()                      -> { <schluessel>: <wert>, ... }  Einstellungen der Oberflaeche
      setUiSetting(key, value)             value = null entfernt den Eintrag

      getEffects()                         -> { compressorOn, compThresholdDb, ..., reverbMix }  Effektkette
      setEffects(teilweise Werte)          -> vollstaendige, begrenzte Werte; wirkt sofort, wird gespeichert.
                                              Nur das Mithoeren klingt anders, die Erkennung bleibt trocken.
      VST3-Plugins im Mithoer-Weg (nach den eigenen Effekten):
      getPlugins()                         -> { scanned, scanning, available: [{ id, name, vendor, category }],
                                                rack: [{ name, vendor, enabled, latencyMs, hasEditor }], latencyMs }
      scanPlugins()                        Suche in den VST3-Ordnern starten; Fortschritt per Event pluginScan
      addPlugin(id) / removePlugin(slot) / movePlugin(slot, delta) / setPluginEnabled(slot, on)
                                           -> wie getPlugins | { error }
      openPluginEditor(slot)               Oberflaeche des Plugins in eigenem Fenster
      setExpectedNotes([midi, ...])        erwartete Toene beim Ueben ([] = keine); wird einer davon in einer
                                              anderen Oktave erkannt, prueft der Kern das Spektrum;
                                              ab zwei Toenen (Akkord) folgt jedem Anschlag ein chord-Event
      setMetronome({on, bpm, volumeDb, beatsPerBar})   Metronom auf eigenem Bus; Einschalten startet
                                              den ersten Schlag ca. 150 ms spaeter

      Statistik (SQLite, <Datenordner>/stats.sqlite):
      statsStartSession({instrument, difficulty, mode, tempo, bpm, dynamicsWindowDb?, source?, gpFile?, gpTrack?})  -> { id }
                                              source "gp" = Lied (gpFile = Name), "scale" = Tonleiter
                                              (gpFile = Name der Tonleiter), sonst Zufall
      statsAddAttempt(id, {expectedMidi, string, fret, playedMidi?, cents, reactionMs?, timingMs?,
                           onsetType, correct, levelDb?, levelDevDb?, bar?})
      statsEndSession(id, {score, durationSec})    (Durchgang ohne Versuche wird verworfen)
      getStats(instrument)                 -> { notes, sessions, confusions, levels }
      getSongStats(instrument, gpFile, gpTrack) -> { bars: [{ bar, attempts, hits }] }  Versuche je Takt
      clearStats(instrument)

      startRecording(sessionId, maxSec?)   Mitschnitt des Eingangs starten (Standard hoechstens 180 s)
      stopRecording()                      -> { durationSec, truncated }
      Liedwiedergabe im Kern (Song-Modus, Ausgabe ueber das Audio-Geraet der App):
      songLoad({ ppq, tempo: [[tick, bpm]], events: [[tick, status, data1, data2]], halts: [tick] })
                                           -> { soundFont }   (halts: Noten der eigenen Spur fuer den Warte-Modus)
      songPlay(withCountIn), songPause(), songSeek(tick), songSetSpeed(factor),
      songSetRange(startTick, endTick, loop, passes), songSetChannelGains([16 Faktoren]),   (passes 0 = endlos)
      songSetMetronome(on, gain), songSetWaitMode(on), songSetReleased(pass, n),
      songSetHalts([tick])                 andere Noten fuer den Warte-Modus (Spurwechsel), Wiedergabe laeuft weiter
      getSoundFont()                       -> { name, path, builtin }   Klang der Liedwiedergabe
      chooseSoundFont()                    -> wie getSoundFont | { error } | null (abgebrochen); Dateidialog .sf2
      resetSoundFont()                     -> wie getSoundFont (eingebauter Soundfont)
      getStreamTime()                      -> { streamMs, inputLatencyMs }  Stream-Uhr jetzt (Abgleich mit der
                                              Wiedergabe in der Oberflaeche)
      openSongFile(startDir?)              -> { path, name, data (Base64) } | { ..., error } | null (abgebrochen)
                                              Dateidialog fuer .gp/.gp3/.gp4/.gp5/.gpx, startet im zuletzt
                                              benutzten Ordner (Einstellung "songs.lastDir")
      readSongFile(path)                   -> wie openSongFile (zuletzt geoeffnete Lieder)
      Aufnahme und Nachanalyse (jeder Uebungsdurchgang):
      runRecordingStart()                  Mitschnitt des Durchgangs starten (bis 10 min)
      reviewFinish(sessionId | null, { mode, toleranceMs, items, liveHits, liveMisses })
                                           -> { sessionId, finalHits, finalTotal, liveHits, liveTotal } | { skipped }
                                              | { error }  Mitschnitt beenden, unter <Datenordner>/recordings
                                              speichern, nachanalysieren, Endwert in der Statistik ablegen;
                                              items = [{ midis, timeMs? (Stream-Uhr), live: "hit" | "miss" }]
      getReview(sessionId)                 -> Ergebnis der Nachanalyse (items, segments, extra, peaks, ...) | null
      playReview(sessionId, fromSec, toSec)  Ausschnitt der Aufnahme ueber den Ausgang abspielen
      stopReview()
      saveDiagnostic(log)                  -> { path } | { error }  letzten Mitschnitt als Diagnose-Aufnahme
                                              speichern: <Dokumente>/Fretboard Trainer/Diagnose/<Zeit>.wav
                                              + .json (log der Oberflaeche, Startzeit der Aufnahme auf der
                                              Stream-Uhr, Einstellungen)

      Kalibrierung (Aufnahmen bewerten, Erkennungsparameter anpassen):
      getCalibration()                     -> { takes, instrument, tuning, defaultTuning, busy }
                                              (tuning und Optimierung gelten fuer das aktuelle Instrument)
      saveCalibrationTake(info)            -> Aufnahme-Eintrag (letzter Mitschnitt)
                                              info = { instrument, exerciseId, title, kind, level,
                                                       minHz, maxHz, notes: [{ midi, type }] }
      deleteCalibrationTake(id)
      optimizeCalibration()                -> { combinations, current, best }
      setDetectionTuning(tuning | null)    -> { takes } (null = Standardwerte; Aufnahmen neu bewertet)

    Kern -> UI (Events, siehe MainComponent):
      level { rmsDb, peakDb, gateOpen }              ca. 30 Hz
      pitch { hz, midi, cents, confidence }          ca. 30 Hz (hz = 0, midi = -1: kein Ton)
      note  { midi, cents, timeMs, onsetType, corrected, levelDb, riseDb }   sobald erkannt; onsetType "pick" | "legato";
            levelDb = Spitzenpegel der Note (dBFS), riseDb = Anstieg gegenueber dem Pegel davor
      chord { timeMs, tones: [{ midi, present, strength, shared }] }   ca. 120-200 ms nach dem Anschlag, wenn
            mehrere Toene erwartet werden: present = Akkordton neu angeschlagen; shared = nicht einzeln
            pruefbar (alle Teiltoene gehoeren auch zu einem anderen Akkordton, z. B. Oktavverdopplung)
      beat  { index, timeMs, accent, latencyMs }     je Metronom-Schlag
            timeMs von note und beat liegen auf derselben Stream-Uhr (ms seit Geraetestart);
            latencyMs = Eingangs- + Ausgangslatenz laut Treiber (Klick hoeren -> Anschlag erfassen)
      songPosition { tick, streamMs, playing, halted, countIn, finished, pass, released, latencyMs }
                                                     ca. 60 Hz waehrend der Liedwiedergabe; tick galt zu streamMs
      calibrationProgress { progress }               waehrend optimizeCalibration (0..1)
      calibrationUpdated {}                          Aufnahmen wurden neu bewertet
      pluginScan { progress, current } | { done, ...getPlugins }   waehrend bzw. nach scanPlugins
*/
class Bridge
{
public:
    using EventSink = std::function<void (const juce::Identifier&, const juce::var&)>;

    Bridge (AudioEngine& engine, AnalysisWorker& analysis, Settings& settings, PluginRack& plugins);

    juce::WebBrowserComponent::Options registerFunctions (juce::WebBrowserComponent::Options options);

    /** Ziel fuer Events, die die Bridge selbst ausloest (z. B. Fortschritt). */
    void setEventSink (EventSink sink) { emitEvent = std::move (sink); }

    /** Soundfont der Liedwiedergabe beim Start: der gewaehlte (Einstellung "songs.soundFont"),
        sonst der eingebaute. builtin laedt den eingebauten (aus dem UI-Paket). */
    void initSoundFont (std::function<bool()> builtin);

    /** Bewertet die Aufnahmen des aktuellen Instruments mit der aktuellen Erkennung neu
        (gespeicherte Bewertungen koennen von einer frueheren Programmversion stammen) und
        meldet danach "calibrationUpdated". */
    void reevaluateCalibration();

private:
    static juce::File diagnosticDirectory();
    static juce::var describeSongFile (const juce::File& file);
    juce::var describeSoundFont() const;
    bool loadSoundFontFile (const juce::File& file);
    void saveDiagnostic (const juce::var& log, juce::WebBrowserComponent::NativeFunctionCompletion done);
    juce::var describeDevices (const juce::String& error = {});
    juce::var describeSettings() const;
    juce::var describeCalibration() const;
    juce::var describeStats (const juce::String& instrument);
    juce::var describePlugins() const;
    void withStats (const juce::WebBrowserComponent::NativeFunctionCompletion& done, const std::function<juce::var()>& work);
    void persistDeviceState();

    AudioEngine& engine;
    AnalysisWorker& analysis;
    Settings& settings;
    PluginRack& plugins;
    std::set<juce::String> scannedTypes;

    CalibrationStore calibration;
    std::unique_ptr<StatsDb> stats;
    juce::String statsError;
    AnalysisWorker::RecordedAudio lastRecording; // Kalibrierung (startRecording/stopRecording)
    ReviewStore reviews;
    std::shared_ptr<const AnalysisWorker::RecordedAudio> lastRunAudio; // Mitschnitt des letzten Durchgangs
    std::shared_ptr<const AnalysisWorker::RecordedAudio> takeRunAudio();
    EventSink emitEvent;
    std::unique_ptr<juce::FileChooser> songChooser, soundFontChooser;
    std::function<bool()> loadBuiltinSoundFont;
    juce::String soundFontPath; // leer = eingebauter Soundfont
    std::atomic<bool> soundFontLoading { false };
    juce::File lastSongDirectory;
};

} // namespace ft
