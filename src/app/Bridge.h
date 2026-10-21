#pragma once

#include "app/CalibrationStore.h"
#include "stats/StatsDb.h"

#include <juce_gui_extra/juce_gui_extra.h>

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

      setExpectedNotes([midi, ...])        erwartete Toene beim Ueben ([] = keine); wird einer davon in einer
                                              anderen Oktave erkannt, prueft der Kern das Spektrum
      setMetronome({on, bpm, volumeDb, beatsPerBar})   Metronom auf eigenem Bus; Einschalten startet
                                              den ersten Schlag ca. 150 ms spaeter

      Statistik (SQLite, <Datenordner>/stats.sqlite):
      statsStartSession({instrument, difficulty, mode, tempo, bpm, dynamicsWindowDb?, source?, gpFile?})  -> { id }
                                              source "gp" = Lied (gpFile = Name), sonst Zufall
      statsAddAttempt(id, {expectedMidi, string, fret, playedMidi?, cents, reactionMs?, timingMs?,
                           onsetType, correct, levelDb?, levelDevDb?})
      statsEndSession(id, {score, durationSec})    (Durchgang ohne Versuche wird verworfen)
      getStats(instrument)                 -> { notes, sessions, confusions, levels }
      clearStats(instrument)

      startRecording(sessionId, maxSec?)   Mitschnitt des Eingangs starten (Standard hoechstens 180 s)
      stopRecording()                      -> { durationSec, truncated }
      openSongFile()                       -> { path, name, data (Base64) } | { ..., error } | null (abgebrochen)
                                              Dateidialog fuer .gp/.gp3/.gp4/.gp5/.gpx
      readSongFile(path)                   -> wie openSongFile (zuletzt geoeffnete Lieder)
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
      beat  { index, timeMs, accent, latencyMs }     je Metronom-Schlag
            timeMs von note und beat liegen auf derselben Stream-Uhr (ms seit Geraetestart);
            latencyMs = Eingangs- + Ausgangslatenz laut Treiber (Klick hoeren -> Anschlag erfassen)
      calibrationProgress { progress }               waehrend optimizeCalibration (0..1)
      calibrationUpdated {}                          Aufnahmen wurden neu bewertet
*/
class Bridge
{
public:
    using EventSink = std::function<void (const juce::Identifier&, const juce::var&)>;

    Bridge (AudioEngine& engine, AnalysisWorker& analysis, Settings& settings);

    juce::WebBrowserComponent::Options registerFunctions (juce::WebBrowserComponent::Options options);

    /** Ziel fuer Events, die die Bridge selbst ausloest (z. B. Fortschritt). */
    void setEventSink (EventSink sink) { emitEvent = std::move (sink); }

    /** Bewertet die Aufnahmen des aktuellen Instruments mit der aktuellen Erkennung neu
        (gespeicherte Bewertungen koennen von einer frueheren Programmversion stammen) und
        meldet danach "calibrationUpdated". */
    void reevaluateCalibration();

private:
    static juce::File diagnosticDirectory();
    static juce::var describeSongFile (const juce::File& file);
    void saveDiagnostic (const juce::var& log, juce::WebBrowserComponent::NativeFunctionCompletion done);
    juce::var describeDevices (const juce::String& error = {});
    juce::var describeSettings() const;
    juce::var describeCalibration() const;
    juce::var describeStats (const juce::String& instrument);
    void withStats (const juce::WebBrowserComponent::NativeFunctionCompletion& done, const std::function<juce::var()>& work);
    void persistDeviceState();

    AudioEngine& engine;
    AnalysisWorker& analysis;
    Settings& settings;
    std::set<juce::String> scannedTypes;

    CalibrationStore calibration;
    std::unique_ptr<StatsDb> stats;
    juce::String statsError;
    AnalysisWorker::RecordedAudio lastRecording;
    EventSink emitEvent;
    std::unique_ptr<juce::FileChooser> songChooser;
    juce::File lastSongDirectory;
};

} // namespace ft
