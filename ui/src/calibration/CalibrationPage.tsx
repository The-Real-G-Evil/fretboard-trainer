import { useEffect, useMemo, useState } from "react";
import { api, type AppSettings, type CalibrationState, type CalibrationTake, type DetectionTuning, type OptimizeResult } from "../api";
import { InstrumentSelect } from "../components/InstrumentSelect";
import type { Instrument } from "../instruments";
import { load, save } from "../storage";
import { ExerciseRecorder } from "./ExerciseRecorder";
import { exercisesFor, LEVEL_NAMES, type Exercise } from "./exercises";
import { TakeResult } from "./TakeResult";
import { GOOD_ACCURACY, RETAKE_ACCURACY, completedLevel, recommendations } from "./recommendations";

interface CalibrationPageProps {
  settings: AppSettings;
  instrument: Instrument; // zentral gewähltes Instrument; Aufnahmen und Parameter gelten je Instrument
  onSelectInstrument: (id: string) => void;
  onApplyGate: (thresholdDb: number) => void;
}

const TUNING_LABELS: { key: keyof DetectionTuning; label: string; unit: string }[] = [
  { key: "minRiseDb", label: "Pegelanstieg für Anschlag", unit: "dB" },
  { key: "strongFluxFactor", label: "Transient ohne Pegelanstieg", unit: "×" },
  { key: "fluxMultiplier", label: "Fluss-Schwelle", unit: "×" },
  { key: "stableFrames", label: "Stabile Frames", unit: "" },
  { key: "legatoFrames", label: "Legato-Mindestdauer", unit: "Frames (je ≈5 ms)" },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function AccuracyBadge({ take }: { take?: CalibrationTake }) {
  if (!take) return <span className="badge-acc none">nicht aufgenommen</span>;
  if (take.kind === "silence")
    return <span className="badge-acc good">{take.noise ? `${take.noise.peakDb.toFixed(0)} dBFS` : "gemessen"}</span>;
  if (!take.score) return <span className="badge-acc none">–</span>;
  const a = take.score.accuracy;
  const cls = a >= GOOD_ACCURACY ? "good" : a >= RETAKE_ACCURACY ? "ok" : "bad";
  return <span className={`badge-acc ${cls}`}>{Math.round(a * 100)} %</span>;
}

export function CalibrationPage({ settings, instrument, onSelectInstrument, onApplyGate }: CalibrationPageProps) {
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

  if (!state) return <section className="card wide-card"><p className="hint">Kalibrierung wird geladen …</p></section>;

  const takes = state.takes.filter((t) => t.instrument === instrument.id);
  const takesOf = (id: string) => takes.filter((t) => t.exerciseId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recs = recommendations(exercises, state.takes, instrument.id, lastOptimizedAt);
  const done = completedLevel(exercises, state.takes, instrument.id);
  const notesTakes = takes.filter((t) => t.kind === "notes").length;
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

  const applyTuning = async (t: DetectionTuning | null) => {
    setState(await api.setDetectionTuning(t));
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
            <h2>Kalibrierung</h2>
            <p className="hint">
              Spiel kurze Vorgaben nach; die App nimmt sie auf, vergleicht die Erkennung mit dem Gespielten
              und passt die Erkennungsparameter an dein Instrument und deine Spielweise an.
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
                  {ex && <button onClick={() => setActive(ex)}>Aufnehmen</button>}
                  {r.kind === "optimize" && <button onClick={optimize} disabled={optimizing !== null}>Optimieren</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card wide-card">
        <h2>Übungen · erreichte Stufe: {done > 0 ? `${done} – ${LEVEL_NAMES[done]}` : "–"}</h2>
        <div className="levels">
          {Object.entries(LEVEL_NAMES).map(([lvl, name]) => {
            const level = Number(lvl);
            const list = exercises.filter((e) => e.level === level);
            const locked = level > done + 1 && level > 1;
            return (
              <div key={lvl} className={`level ${locked ? "locked" : ""}`}>
                <h3>
                  Stufe {level}: {name}
                  {locked && <span className="hint"> · empfohlen nach Stufe {level - 1}</span>}
                </h3>
                {list.map((e) => {
                  const history = takesOf(e.id);
                  const latest = history[0];
                  return (
                    <div key={e.id} className="exercise-row">
                      <div className="exercise-main">
                        <strong>{e.title}</strong>
                        <span className="hint">
                          {e.kind === "silence" ? `${e.durationSec} s Ruhe` : `${e.notes.length} Töne`}
                          {latest && ` · zuletzt ${formatDate(latest.createdAt)}`}
                          {history.length > 1 && ` · ${history.length} Aufnahmen`}
                        </span>
                      </div>
                      <AccuracyBadge take={latest} />
                      {history.length > 0 && (
                        <button onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                          {expanded === e.id ? "Details aus" : "Details"}
                        </button>
                      )}
                      <button className={latest ? "" : "primary"} onClick={() => setActive(e)}>
                        {latest ? "Neu aufnehmen" : "Aufnehmen"}
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
                              {history.map((t) => (
                                <tr key={t.id}>
                                  <td>{formatDate(t.createdAt)}</td>
                                  <td>{t.durationSec.toFixed(1)} s</td>
                                  <td><AccuracyBadge take={t} /></td>
                                  <td><button onClick={() => remove(t.id)}>Löschen</button></td>
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
        <h2>Erkennungsparameter für {instrument.name}</h2>
        <div className="tuning">
          <table className="tuning-table">
            <thead>
              <tr><th /><th>aktuell</th><th>Standard</th>{optimizeResult && !optimizeResult.error && <th>Vorschlag</th>}</tr>
            </thead>
            <tbody>
              {TUNING_LABELS.map(({ key, label, unit }) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{state.tuning[key]} {unit}</td>
                  <td className="hint">{state.defaultTuning[key]} {unit}</td>
                  {optimizeResult && !optimizeResult.error && (
                    <td className={optimizeResult.best.tuning[key] !== state.tuning[key] ? "changed" : ""}>
                      {optimizeResult.best.tuning[key]} {unit}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tuning-actions">
            <button className="primary" onClick={optimize} disabled={optimizing !== null || notesTakes === 0}>
              Parameter optimieren
            </button>
            {!isDefault && <button onClick={() => applyTuning(null)}>Auf Standard zurücksetzen</button>}
            {notesTakes === 0 && <span className="hint">Dafür zuerst mindestens eine Übung aufnehmen.</span>}
            {optimizing !== null && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(optimizing * 100)}>
                <div style={{ width: `${optimizing * 100}%` }} />
              </div>
            )}
          </div>

          {optimizeResult?.error && <p className="error">{optimizeResult.error}</p>}
          {optimizeResult && !optimizeResult.error && (
            <div className="optimize-result">
              <p>
                {optimizeResult.combinations} Kombinationen auf {optimizeResult.current.takes.length}{" "}
                {optimizeResult.current.takes.length === 1 ? "Aufnahme" : "Aufnahmen"} geprüft.
                Fehler gesamt: <strong>{optimizeResult.current.totalCost}</strong> mit den aktuellen Parametern,{" "}
                <strong>{optimizeResult.best.totalCost}</strong> mit dem Vorschlag.
              </p>
              {optimizeResult.best.totalCost < optimizeResult.current.totalCost ? (
                <div className="recorder-actions">
                  <button className="primary" onClick={() => applyTuning(optimizeResult.best.tuning)}>Vorschlag übernehmen</button>
                  <button onClick={() => setOptimizeResult(null)}>Verwerfen</button>
                </div>
              ) : (
                <p className="hint">Die aktuellen Parameter sind bereits die besten für deine Aufnahmen.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
