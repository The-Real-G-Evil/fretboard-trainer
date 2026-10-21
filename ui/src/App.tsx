import { useEffect, useState } from "react";
import { api, type AppSettings } from "./api";
import { isNative } from "./juce";
import { DeviceSettings } from "./components/DeviceSettings";
import { InputSettings } from "./components/InputSettings";
import { NoiseGateSettings } from "./components/NoiseGateSettings";
import { LevelMeter } from "./components/LevelMeter";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<AppSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fretboard Trainer</h1>
        <span className="subtitle">Audio-Einstellungen</span>
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
        </main>
      )}
    </div>
  );
}
