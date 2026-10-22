import { useEffect, useMemo, useState } from "react";
import { api, type AppSettings } from "./api";
import { isNative } from "./juce";
import { CalibrationHint } from "./calibration/CalibrationHint";
import { CalibrationPage } from "./calibration/CalibrationPage";
import { DetectionSettings } from "./components/DetectionSettings";
import { InstrumentSelect } from "./components/InstrumentSelect";
import { instrumentById, type Instrument } from "./instruments";
import { DeviceSettings } from "./components/DeviceSettings";
import { InputSettings } from "./components/InputSettings";
import { NoiseGateSettings } from "./components/NoiseGateSettings";
import { LevelMeter } from "./components/LevelMeter";
import { SoundFontSettings } from "./components/SoundFontSettings";
import { Tuner } from "./components/Tuner";
import { tunedInstrument } from "./music/tunings";
import { PracticePage } from "./practice/PracticePage";
import { StatsPage } from "./stats/StatsPage";
import { difficultyOf, practiceFor, saveDifficulty, savePractice, type InstrumentPractice, type UiSettings } from "./practice/settings";
import { saveTiming, timingOf } from "./practice/timing";
import { saveSong, songOf } from "./song/songPractice";
import { saveScale, scaleOf } from "./practice/ScalePanel";
import { rhythmOf, saveRhythm } from "./practice/rhythmSettings";

type Page = "practice" | "stats" | "tuner" | "settings";
type SettingsTab = "audio" | "calibration";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ui, setUi] = useState<UiSettings | null>(null);
  const [page, setPage] = useState<Page>("practice");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("audio");

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getUiSettings().then(setUi);
  }, []);

  const instrument = instrumentById(settings?.instrument ?? "");
  const practice = ui ? practiceFor(ui, instrument) : null;
  const tuningKey = practice ? practice.tuning.offsets.join(",") : "";
  // Gestimmtes Instrument stabil halten, damit Übung und Griffbrett nicht bei jedem Rendern neu starten
  const tuned = useMemo(
    () => (practice ? tunedInstrument(instrument, practice.tuning) : instrument),
    [instrument, tuningKey],
  );

  if (!settings || !ui || !practice) return <div className="app" />;

  const update = (patch: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const setNoiseGate = (noiseGate: AppSettings["noiseGate"]) => {
    update({ noiseGate });
    api.setNoiseGate(noiseGate);
  };

  const setDetection = async (detection: AppSettings["detection"]) => {
    update({ detection });
    await api.setDetectionConfig(detection);
  };

  // Lädt das Profil des Instruments (Tonbereich, Erkennungsparameter); neue Profile starten
  // mit dem Standardbereich des Instruments in seiner gespeicherten Stimmung
  const selectInstrument = async (id: string) => {
    const inst = instrumentById(id);
    const t = tunedInstrument(inst, practiceFor(ui, inst).tuning);
    setSettings(await api.setInstrument(inst.id, t.minHz, t.maxHz));
  };

  const changePractice = (p: InstrumentPractice) => {
    const before: Instrument = tuned;
    const after = tunedInstrument(instrument, p.tuning);
    setUi(savePractice(ui, instrument.id, p));

    // Stand der Tonbereich auf dem Standard der alten Stimmung, folgt er der neuen
    const d = settings.detection;
    if (d.minHz === before.minHz && d.maxHz === before.maxHz && (after.minHz !== d.minHz || after.maxHz !== d.maxHz))
      setDetection({ ...d, minHz: after.minHz, maxHz: after.maxHz });
  };

  const openCalibration = () => {
    setPage("settings");
    setSettingsTab("calibration");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fretboard Trainer</h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={page === "practice"} onClick={() => setPage("practice")}>Üben</button>
          <button role="tab" aria-selected={page === "stats"} onClick={() => setPage("stats")}>Statistik</button>
          <button role="tab" aria-selected={page === "tuner"} onClick={() => setPage("tuner")}>Stimmgerät</button>
          <button role="tab" aria-selected={page === "settings"} onClick={() => setPage("settings")}>Einstellungen</button>
        </nav>
        {page === "settings" && (
          <nav className="tabs sub" role="tablist">
            <button role="tab" aria-selected={settingsTab === "audio"} onClick={() => setSettingsTab("audio")}>
              Audio &amp; Erkennung
            </button>
            <button role="tab" aria-selected={settingsTab === "calibration"} onClick={() => setSettingsTab("calibration")}>
              Kalibrierung
            </button>
          </nav>
        )}
        {!isNative && <span className="badge">Vorschau ohne Audio-Kern</span>}
      </header>

      <main className="layout">
        {page === "settings" && (
          <section className="card meter-card">
            <h2>Pegel</h2>
            <LevelMeter
              gate={settings.noiseGate}
              onThresholdChange={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })}
            />
          </section>
        )}

        {page === "practice" && (
          <>
            <CalibrationHint instrument={tuned} onOpen={openCalibration} />
            <PracticePage
              instrument={instrument}
              tuned={tuned}
              practice={practice}
              difficulty={difficultyOf(ui)}
              timing={timingOf(ui)}
              centsTolerance={settings.detection.centsTolerance}
              onPracticeChange={changePractice}
              onDifficultyChange={(d) => setUi(saveDifficulty(ui, d))}
              onTimingChange={(t) => setUi(saveTiming(ui, t))}
              song={songOf(ui)}
              onSongChange={(s) => setUi(saveSong(ui, s))}
              scale={scaleOf(ui)}
              onScaleChange={(s) => setUi(saveScale(ui, s))}
              rhythm={rhythmOf(ui)}
              onRhythmChange={(r) => setUi(saveRhythm(ui, r))}
            />
          </>
        )}

        {page === "stats" && <StatsPage instrument={tuned} clef={practice.clef} />}

        {page === "tuner" && (
          <>
            <CalibrationHint instrument={tuned} onOpen={openCalibration} />
            <Tuner centsTolerance={settings.detection.centsTolerance} instrumentName={instrument.name} />
          </>
        )}

        {page === "settings" && settingsTab === "calibration" && (
          <CalibrationPage
            settings={settings}
            instrument={tuned}
            onSelectInstrument={selectInstrument}
            onApplyGate={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })}
          />
        )}

        {page === "settings" && settingsTab === "audio" && (
          <>
            <section className="card">
              <h2>Audio-Gerät</h2>
              <DeviceSettings />
            </section>

            <section className="card">
              <h2>Klang der Liedwiedergabe</h2>
              <SoundFontSettings />
            </section>

            <section className="card">
              <h2>Eingang &amp; Mithören</h2>
              <InputSettings
                inputGainDb={settings.inputGainDb}
                monitoring={settings.monitoring}
                onInputGainChange={(inputGainDb) => {
                  update({ inputGainDb });
                  api.setInputGain(inputGainDb);
                }}
                onMonitoringChange={(monitoring) => {
                  update({ monitoring });
                  api.setMonitoring(monitoring.on, monitoring.volumeDb);
                }}
              />
            </section>

            <section className="card">
              <h2>Noisegate</h2>
              <NoiseGateSettings params={settings.noiseGate} onChange={setNoiseGate} />
            </section>

            <section className="card wide-card">
              <h2>Instrument &amp; Tonerkennung</h2>
              <div className="fields">
                <InstrumentSelect instrument={tuned} onChange={selectInstrument} />
                <DetectionSettings config={settings.detection} instrument={tuned} onChange={setDetection} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
