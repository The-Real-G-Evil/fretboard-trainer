import { useEffect, useState } from "react";
import { api, type AppSettings } from "./api";
import { isNative } from "./juce";
import { DetectionSettings } from "./components/DetectionSettings";
import { DeviceSettings } from "./components/DeviceSettings";
import { InputSettings } from "./components/InputSettings";
import { NoiseGateSettings } from "./components/NoiseGateSettings";
import { LevelMeter } from "./components/LevelMeter";
import { Tuner } from "./components/Tuner";

type Page = "tuner" | "settings";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [page, setPage] = useState<Page>("tuner");

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<AppSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fretboard Trainer</h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={page === "tuner"} onClick={() => setPage("tuner")}>
            Stimmgerät
          </button>
          <button role="tab" aria-selected={page === "settings"} onClick={() => setPage("settings")}>
            Einstellungen
          </button>
        </nav>
        {!isNative && <span className="badge">Vorschau ohne Audio-Kern</span>}
      </header>

      {settings && (
        <main className="layout">
          <section className="card meter-card">
            <h2>Pegel</h2>
            <LevelMeter
              gate={settings.noiseGate}
              onThresholdChange={(thresholdDb) => {
                const noiseGate = { ...settings.noiseGate, thresholdDb };
                update({ noiseGate });
                api.setNoiseGate(noiseGate);
              }}
            />
          </section>

          {page === "tuner" && <Tuner centsTolerance={settings.detection.centsTolerance} />}

          {page === "settings" && (
            <>
              <section className="card">
                <h2>Audio-Gerät</h2>
                <DeviceSettings />
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
                <NoiseGateSettings
                  params={settings.noiseGate}
                  onChange={(noiseGate) => {
                    update({ noiseGate });
                    api.setNoiseGate(noiseGate);
                  }}
                />
              </section>

              <section className="card wide-card">
                <h2>Tonerkennung</h2>
                <DetectionSettings
                  config={settings.detection}
                  onChange={(detection) => {
                    update({ detection });
                    api.setDetectionConfig(detection);
                  }}
                />
              </section>
            </>
          )}
        </main>
      )}
    </div>
  );
}
