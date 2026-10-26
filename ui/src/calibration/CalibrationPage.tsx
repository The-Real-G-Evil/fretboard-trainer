import { useEffect, useMemo, useState } from "react";
import { api, type AppSettings, type CalibrationState, type CalibrationTake, type DetectionTuning, type OptimizeResult } from "../api";
import { InstrumentSelect } from "../components/InstrumentSelect";
import type { Instrument } from "../instruments";
import { load, save } from "../storage";
import { ExerciseRecorder } from "./ExerciseRecorder";
import { exercisesFor, LEVEL_NAMES, type Exercise } from "./exercises";
import { TakeResult } from "./TakeResult";
import { TimingCheck } from "./TimingCheck";
import type { TimingSettings } from "../practice/timing";
import { locale, t, tCore, tKey } from "../i18n";
import { GOOD_ACCURACY, RETAKE_ACCURACY, completedLevel, recommendations } from "./recommendations";

interface CalibrationPageProps {
  settings: AppSettings;
  instrument: Instrument; // zentral gewähltes Instrument; Aufnahmen und Parameter gelten je Instrument
  onSelectInstrument: (id: string) => void;
  onApplyGate: (thresholdDb: number) => void;
  timing: TimingSettings; // Timing-Ausgleich und Metronom-Lautstärke (Üben)
  onApplyOffset: (offsetMs: number) => void;
}

const TUNING_LABELS: { key: keyof DetectionTuning; label: string; unit: string }[] = [
  { key: "minRiseDb", label: tKey("Pegelanstieg für Anschlag"), unit: "dB" },
  { key: "strongFluxFactor", label: tKey("Transient ohne Pegelanstieg"), unit: "×" },
  { key: "fluxMultiplier", label: tKey("Fluss-Schwelle"), unit: "×" },
  { key: "stableFrames", label: tKey("Stabile Frames"), unit: "" },
  { key: "legatoFrames", label: tKey("Legato-Mindestdauer"), unit: tKey("Frames (je ≈5 ms)") },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" });

function AccuracyBadge({ take }: { take?: CalibrationTake }) {
  if (!take) return <span className="badge-acc none">{t("nicht aufgenommen")}</span>;
  if (take.kind === "silence")
    return <span className="badge-acc good">{take.noise ? `${take.noise.peakDb.toFixed(0)} dBFS` : t("gemessen")}</span>;
  if (!take.score) return <span className="badge-acc none">–</span>;
  const a = take.score.accuracy;
  const cls = a >= GOOD_ACCURACY ? "good" : a >= RETAKE_ACCURACY ? "ok" : "bad";
  return <span className={`badge-acc ${cls}`}>{Math.round(a * 100)} %</span>;
}

export function CalibrationPage({ settings, instrument, onSelectInstrument, onApplyGate, timing, onApplyOffset }: CalibrationPageProps) {
  const [state, setState] = useState<CalibrationState | null>(null);
  const [active, setActive] = useState<Exercise | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState<number | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const optimizedKey = `calibration.lastOptimizedAt.${instrument.id}`;
  const [lastOptimizedAt, setLastOptimizedAt] = useState(() => load(optimizedKey));

  const exercises = useMemo(() => exercisesFor(instrument), [instrument]);

  const refresh = () => api.getCalibration().then(setState);

  // Jedes Instrument hat eigene Parameter: beim Wechsel neu laden
  useEffect(() => {
    refresh();
    setOptimizeResult(null);
    setActive(null);
    setLastOptimizedAt(load(optimizedKey));
  }, [instrument.id]);
  useEffect(() => api.onCalibrationProgress((e) => setOptimizing(e.progress)), []);
  useEffect(() => api.onCalibrationUpdated(() => refresh()), []);

  if (!state) return <section className="card wide-card"><p className="hint">{t("Kalibrierung wird geladen …")}</p></section>;

  const takes = state.takes.filter((tk) => tk.instrument === instrument.id);
  const takesOf = (id: string) => takes.filter((tk) => tk.exerciseId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recs = recommendations(exercises, state.takes, instrument.id, lastOptimizedAt);
  const done = completedLevel(exercises, state.takes, instrument.id);
  const notesTakes = takes.filter((tk) => tk.kind === "notes").length;
  const isDefault = TUNING_LABELS.every(({ key }) => state.tuning[key] === state.defaultTuning[key]);

  const optimize = async () => {
    setOptimizing(0);
    setOptimizeResult(null);
    try {
      setOptimizeResult(await api.optimizeCalibration());
      const now = new Date().toISOString();
      setLastOptimizedAt(now);
      save(optimizedKey, now);
    } finally {
      setOptimizing(null);
    }
  };

  const applyTuning = async (tuning: DetectionTuning | null) => {
    setState(await api.setDetectionTuning(tuning));
    setOptimizeResult(null);
  };

  const remove = async (id: string) => {
    await api.deleteCalibrationTake(id);
    refresh();
  };

  if (active) {
    return (
      <section className="card wide-card">
        <ExerciseRecorder
          key={active.id}
          exercise={active}
          instrument={instrument}
          detection={settings.detection}
          gateThresholdDb={settings.noiseGate.thresholdDb}
          onSaved={() => refresh()}
          onApplyGate={onApplyGate}
          onSwitchInstrument={(id) => {
            setActive(null);
            onSelectInstrument(id);
          }}
          onClose={() => setActive(null)}
        />
      </section>
    );
  }

  return (
    <>
      <section className="card wide-card">
        <div className="calib-head">
          <div>
            <h2>{t("Kalibrierung")}</h2>
            <p className="hint">
              {t("Spiel kurze Vorgaben nach; die App nimmt sie auf, vergleicht die Erkennung mit dem Gespielten und passt die Erkennungsparameter an dein Instrument und deine Spielweise an.")}
            </p>
          </div>
          <InstrumentSelect instrument={instrument} onChange={onSelectInstrument} />
        </div>

        {recs.length > 0 && (
          <ul className="recommendations">
            {recs.map((r, i) => {
              const ex = exercises.find((e) => e.id === r.exerciseId);
              return (
                <li key={i} className={r.kind}>
                  <span>{r.text}</span>
                  {ex && <button onClick={() => setActive(ex)}>{t("Aufnehmen")}</button>}
                  {r.kind === "optimize" && <button onClick={optimize} disabled={optimizing !== null}>{t("Optimieren")}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card wide-card">
        <h2>{t("Übungen · erreichte Stufe:")} {done > 0 ? `${done} – ${t(LEVEL_NAMES[done])}` : "–"}</h2>
        <div className="levels">
          {Object.entries(LEVEL_NAMES).map(([lvl, name]) => {
            const level = Number(lvl);
            const list = exercises.filter((e) => e.level === level);
            const locked = level > done + 1 && level > 1;
            return (
              <div key={lvl} className={`level ${locked ? "locked" : ""}`}>
                <h3>
                  {t("Stufe {n}: {name}", { n: level, name: t(name) })}
                  {locked && <span className="hint"> · {t("empfohlen nach Stufe {n}", { n: level - 1 })}</span>}
                </h3>
                {list.map((e) => {
                  const history = takesOf(e.id);
                  const latest = history[0];
                  return (
                    <div key={e.id} className="exercise-row">
                      <div className="exercise-main">
                        <strong>{e.title}</strong>
                        <span className="hint">
                          {e.kind === "silence" ? t("{s} s Ruhe", { s: e.durationSec ?? 4 }) : t("{n} Töne", { n: e.notes.length })}
                          {latest && " · " + t("zuletzt {date}", { date: formatDate(latest.createdAt) })}
                          {history.length > 1 && " · " + t("{n} Aufnahmen", { n: history.length })}
                        </span>
                      </div>
                      <AccuracyBadge take={latest} />
                      {history.length > 0 && (
                        <button onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                          {expanded === e.id ? t("Details aus") : t("Details")}
                        </button>
                      )}
                      <button className={latest ? "" : "primary"} onClick={() => setActive(e)}>
                        {latest ? t("Neu aufnehmen") : t("Aufnehmen")}
                      </button>
                      {expanded === e.id && (
                        <div className="exercise-details">
                          {latest && (
                            <TakeResult take={latest} exercise={e} instrument={instrument}
                                        gateThresholdDb={settings.noiseGate.thresholdDb} onApplyGate={onApplyGate}
                                        onSwitchInstrument={onSelectInstrument} />
                          )}
                          <table className="take-list">
                            <tbody>
                              {history.map((tk) => (
                                <tr key={tk.id}>
                                  <td>{formatDate(tk.createdAt)}</td>
                                  <td>{tk.durationSec.toFixed(1)} s</td>
                                  <td><AccuracyBadge take={tk} /></td>
                                  <td><button onClick={() => remove(tk.id)}>{t("Löschen")}</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card wide-card">
        <h2>{t("Timing messen")}</h2>
        <TimingCheck offsetMs={timing.offsetMs} volumeDb={timing.volumeDb} onApply={onApplyOffset} />
      </section>

      <section className="card wide-card">
        <h2>{t("Erkennungsparameter für {name}", { name: instrument.name })}</h2>
        <div className="tuning">
          <table className="tuning-table">
            <thead>
              <tr><th /><th>{t("aktuell")}</th><th>{t("Standard")}</th>{optimizeResult && !optimizeResult.error && <th>{t("Vorschlag")}</th>}</tr>
            </thead>
            <tbody>
              {TUNING_LABELS.map(({ key, label, unit }) => (
                <tr key={key}>
                  <td>{t(label)}</td>
                  <td>{state.tuning[key]} {unit && t(unit)}</td>
                  <td className="hint">{state.defaultTuning[key]} {unit && t(unit)}</td>
                  {optimizeResult && !optimizeResult.error && (
                    <td className={optimizeResult.best.tuning[key] !== state.tuning[key] ? "changed" : ""}>
                      {optimizeResult.best.tuning[key]} {unit && t(unit)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tuning-actions">
            <button className="primary" onClick={optimize} disabled={optimizing !== null || notesTakes === 0}>
              {t("Parameter optimieren")}
            </button>
            {!isDefault && <button onClick={() => applyTuning(null)}>{t("Auf Standard zurücksetzen")}</button>}
            {notesTakes === 0 && <span className="hint">{t("Dafür zuerst mindestens eine Übung aufnehmen.")}</span>}
            {optimizing !== null && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(optimizing * 100)}>
                <div style={{ width: `${optimizing * 100}%` }} />
              </div>
            )}
          </div>

          {optimizeResult?.error && <p className="error">{tCore(optimizeResult.error)}</p>}
          {optimizeResult && !optimizeResult.error && (
            <div className="optimize-result">
              <p>
                {optimizeResult.current.takes.length === 1
                  ? t("{n} Kombinationen auf 1 Aufnahme geprüft.", { n: optimizeResult.combinations })
                  : t("{n} Kombinationen auf {takes} Aufnahmen geprüft.", { n: optimizeResult.combinations, takes: optimizeResult.current.takes.length })}{" "}
                {t("Fehler gesamt: {current} mit den aktuellen Parametern, {best} mit dem Vorschlag.", { current: optimizeResult.current.totalCost, best: optimizeResult.best.totalCost })}
              </p>
              {optimizeResult.best.totalCost < optimizeResult.current.totalCost ? (
                <div className="recorder-actions">
                  <button className="primary" onClick={() => applyTuning(optimizeResult.best.tuning)}>{t("Vorschlag übernehmen")}</button>
                  <button onClick={() => setOptimizeResult(null)}>{t("Verwerfen")}</button>
                </div>
              ) : (
                <p className="hint">{t("Die aktuellen Parameter sind bereits die besten für deine Aufnahmen.")}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
