import { useEffect, useState, type ReactNode } from "react";
import { api, type AppSettings, type SettingsTab } from "../api";
import { CalibrationPage } from "../calibration/CalibrationPage";
import { DetectionSettings } from "../components/DetectionSettings";
import { DeviceSettings } from "../components/DeviceSettings";
import { InputSettings } from "../components/InputSettings";
import { InstrumentSelect } from "../components/InstrumentSelect";
import { LevelMeter } from "../components/LevelMeter";
import { NoiseGateSettings } from "../components/NoiseGateSettings";
import { SoundFontSettings } from "../components/SoundFontSettings";
import { SupportPage } from "../components/SupportPage";
import { LANGUAGES, t, type Lang } from "../i18n";
import { instrumentById } from "../instruments";
import { tunedInstrument } from "../music/tunings";
import { practiceFor } from "../practice/settings";
import { saveTiming, timingOf } from "../practice/timing";
import { PLATFORM, useSharedSettings } from "../sharedSettings";
import { UpdateSettings } from "../update/UpdateViews";
import { APPEARANCES, appearanceOf, useAppearance, type Appearance } from "../theme";

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "Allgemein", icon: <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.2 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" /> },
  { id: "audio", label: "Audio & Erkennung", icon: <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" /> },
  { id: "calibration", label: "Kalibrierung", icon: <path d="M3 17h7v2H3zm0-6h11v2H3zm0-6h5v2H3zm9-1h2v6h-2V8h-1V6h1zm6 6h2v2h-2v2h-2v-6h2zm-4 6h2v6h-2v-2h-1v-2h1z" /> },
  { id: "updates", label: "Version & Updates", icon: <path d="M12 4a8 8 0 0 1 7.7 6h-2.1A6 6 0 1 0 18 14h2a8 8 0 1 1-8-10zm0 4 4 4h-3v4h-2v-4H8z" /> },
  { id: "support", label: "Unterstützen", icon: <path d="M12 20.5 4.6 13.3A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 7.4 5.9z" /> },
];

const isTab = (v: unknown): v is SettingsTab => TABS.some((x) => x.id === v);

/** Einstellungsfenster (eigenes Fenster des Kerns, ?view=settings): Reiter als Toolbar (macOS) bzw.
    Seitenleiste (Windows, Linux), Look des Systems. */
export function SettingsApp() {
  const { settings, setSettings, ui, setUi, lang } = useSharedSettings();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const p = new URLSearchParams(location.search).get("tab");
    return isTab(p) ? p : "general";
  });

  useEffect(() => api.onSettingsTab((e) => { if (isTab(e.tab)) setTab(e.tab); }), []);
  useAppearance(appearanceOf(ui));

  if (!settings || !ui) return <div className="sys-settings" />;

  const instrument = instrumentById(settings.instrument);
  const tuned = tunedInstrument(instrument, practiceFor(ui, instrument).tuning);
  const update = (patch: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));
  const setNoiseGate = (noiseGate: AppSettings["noiseGate"]) => {
    update({ noiseGate });
    api.setNoiseGate(noiseGate);
  };
  const setDetection = async (detection: AppSettings["detection"]) => {
    update({ detection });
    await api.setDetectionConfig(detection);
  };
  // Lädt das Profil des Instruments; neue Profile starten mit dem Standardbereich in der gespeicherten Stimmung
  const selectInstrument = async (id: string) => {
    const inst = instrumentById(id);
    const tt = tunedInstrument(inst, practiceFor(ui, inst).tuning);
    setSettings(await api.setInstrument(inst.id, tt.minHz, tt.maxHz));
  };

  const nav = (
    <nav className={PLATFORM === "mac" ? "sys-toolbar" : "sys-sidebar"} role="tablist">
      {TABS.map((x) => (
        <button key={x.id} role="tab" className="sys-tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{x.icon}</svg>
          <span>{t(x.label)}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="sys-settings" key={lang}>
      {nav}
      <main className="sys-content">
        {PLATFORM !== "mac" && <h1 className="sys-title">{t(TABS.find((x) => x.id === tab)!.label)}</h1>}
        <div className="layout">
          {tab === "general" && (
            <section className="card wide-card">
              <h2>{t("Allgemein")}</h2>
              <div className="fields">
                <div className="field">
                  <label id="appearance-label">{t("Erscheinungsbild")}</label>
                  <div className="segmented" role="radiogroup" aria-labelledby="appearance-label">
                    {APPEARANCES.map((a) => (
                      <button key={a.id} role="radio" aria-checked={appearanceOf(ui) === a.id}
                              onClick={() => {
                                api.setUiSetting("appearance", a.id);
                                setUi({ ...ui, appearance: a.id satisfies Appearance });
                              }}>
                        {t(a.label)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="hint">{t("„Automatisch“ folgt der Einstellung des Systems. Gilt für alle Fenster der App.")}</p>
                <div className="field">
                  <label htmlFor="language-select">{t("Sprache")}</label>
                  <select id="language-select" value={lang}
                          onChange={(e) => {
                            const l = e.target.value as Lang;
                            api.setUiSetting("language", l);
                            setUi({ ...ui, language: l });
                          }}>
                    {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          {tab === "audio" && (
            <>
              <section className="card meter-card">
                <h2>{t("Pegel")}</h2>
                <LevelMeter gate={settings.noiseGate}
                            onThresholdChange={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })} />
              </section>
              <section className="card wide-card">
                <h2>{t("Audio-Gerät")}</h2>
                <DeviceSettings />
              </section>
              <section className="card wide-card">
                <h2>{t("Eingang & Mithören")}</h2>
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
              <section className="card wide-card">
                <h2>{t("Noisegate")}</h2>
                <NoiseGateSettings params={settings.noiseGate} onChange={setNoiseGate} />
              </section>
              <section className="card wide-card">
                <h2>{t("Instrument & Tonerkennung")}</h2>
                <div className="fields">
                  <InstrumentSelect instrument={tuned} onChange={selectInstrument} />
                  <DetectionSettings config={settings.detection} instrument={tuned} onChange={setDetection} />
                </div>
              </section>
              <section className="card wide-card">
                <h2>{t("Klang der Liedwiedergabe")}</h2>
                <SoundFontSettings />
              </section>
            </>
          )}

          {tab === "calibration" && (
            <CalibrationPage
              settings={settings}
              instrument={tuned}
              onSelectInstrument={selectInstrument}
              onApplyGate={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })}
              timing={timingOf(ui)}
              onApplyOffset={(offsetMs) => setUi(saveTiming(ui, { ...timingOf(ui), offsetMs }))}
            />
          )}

          {tab === "updates" && (
            <UpdateSettings current={settings.version ?? ""} autoCheck={ui["update.autoCheck"] !== false}
                            onAutoCheckChange={(on) => {
                              api.setUiSetting("update.autoCheck", on);
                              setUi({ ...ui, "update.autoCheck": on });
                            }} />
          )}

          {tab === "support" && <SupportPage />}
        </div>
      </main>
    </div>
  );
}
