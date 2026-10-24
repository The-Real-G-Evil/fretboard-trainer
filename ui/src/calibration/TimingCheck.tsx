import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { COUNT_IN_BEATS, deviationFor, evaluateTaps, MEASURE_BEATS, MIN_TAPS, type TimedBeat, type TimingResult } from "./tapTiming";

interface TimingCheckProps {
  offsetMs: number; // aktueller Timing-Ausgleich (Üben)
  volumeDb: number; // Metronom-Lautstärke wie beim Üben
  onApply: (offsetMs: number) => void;
}

const TEMPOS = [60, 80, 100, 120];

/** Timing-Messung: Metronom läuft, gedämpfte Saiten im Takt antippen; der Median der Abweichung
    (ohne Treiber-Latenz) wird als Timing-Ausgleich vorgeschlagen. */
export function TimingCheck({ offsetMs, volumeDb, onApply }: TimingCheckProps) {
  const [bpm, setBpm] = useState(80);
  const [phase, setPhase] = useState<"idle" | "countIn" | "measure" | "done">("idle");
  const [beatNo, setBeatNo] = useState(0);
  const [taps, setTaps] = useState<number[]>([]); // Abweichungen live (ms)
  const [result, setResult] = useState<TimingResult | null>(null);
  const [applied, setApplied] = useState(false);
  const run = useRef<{ beats: TimedBeat[]; onsets: number[]; count: number } | null>(null);

  const stop = () => {
    api.setMetronome({ on: false, bpm, volumeDb, beatsPerBar: 4 });
    run.current = null;
  };

  useEffect(() => {
    const offBeat = api.onBeat((b) => {
      const r = run.current;
      if (!r) return;
      r.count++;
      setBeatNo(r.count);
      if (r.count <= COUNT_IN_BEATS) return; // Vorzähler: nicht werten
      if (r.count > COUNT_IN_BEATS + MEASURE_BEATS) {
        // ein Schlag Nachlauf, damit späte Anschläge auf den letzten Klick noch zählen
        const res = evaluateTaps(r.beats, r.onsets, 60000 / bpm);
        stop();
        setResult(res);
        setPhase("done");
        return;
      }
      if (r.count === COUNT_IN_BEATS + 1) setPhase("measure");
      r.beats.push({ timeMs: b.timeMs, latencyMs: b.latencyMs });
    });
    const offOnset = api.onOnset((o) => {
      const r = run.current;
      if (!r || r.count < COUNT_IN_BEATS) return;
      r.onsets.push(o.timeMs);
      const d = deviationFor(o.timeMs, r.beats, 60000 / bpm);
      if (d) setTaps((t) => [...t, Math.round(d.dev)]);
    });
    return () => {
      offBeat();
      offOnset();
      if (run.current) stop();
    };
  }, [bpm, volumeDb]);

  const start = () => {
    run.current = { beats: [], onsets: [], count: 0 };
    setTaps([]);
    setResult(null);
    setApplied(false);
    setBeatNo(0);
    setPhase("countIn");
    api.setMetronome({ on: true, bpm, volumeDb, beatsPerBar: 4 });
  };
  const cancel = () => {
    stop();
    setPhase("idle");
  };

  const running = phase === "countIn" || phase === "measure";
  const last = taps[taps.length - 1];

  return (
    <div className="timing-check">
      <p className="hint">
        Saiten mit der Greifhand abdämpfen und zum Klick anschlagen – nach {COUNT_IN_BEATS} Klicks Vorzähler
        {" "}{MEASURE_BEATS} Schläge lang. Gemessen wird, wie weit deine Anschläge nach Abzug der Treiber-Latenz
        neben dem Klick liegen; das ergibt den Timing-Ausgleich für Mitspielen und getaktetes Üben.
      </p>
      <div className="recorder-actions">
        <label>
          <span>Tempo</span>
          <select value={bpm} disabled={running} onChange={(e) => setBpm(Number(e.target.value))}>
            {TEMPOS.map((t) => <option key={t} value={t}>{t} BPM</option>)}
          </select>
        </label>
        {running
          ? <button onClick={cancel}>Abbrechen</button>
          : <button className="primary" onClick={start}>{phase === "done" ? "Nochmal messen" : "Messung starten"}</button>}
        <span className="hint">Aktueller Timing-Ausgleich: {offsetMs} ms</span>
      </div>

      {phase === "countIn" && <p><strong>Vorzähler … {Math.min(beatNo, COUNT_IN_BEATS)} / {COUNT_IN_BEATS}</strong></p>}
      {phase === "measure" && (
        <p>
          <strong>Schlag {Math.max(0, beatNo - COUNT_IN_BEATS)} / {MEASURE_BEATS}</strong>
          <span className="hint"> · {taps.length} Anschläge erkannt
            {last !== undefined && ` · zuletzt ${last > 0 ? "+" : ""}${last} ms`}</span>
        </p>
      )}
      {taps.length > 0 && (
        <div className="timing-taps" aria-label="Abweichung je Anschlag">
          {taps.map((d, i) => (
            <span key={i} className={Math.abs(d) <= 30 ? "good" : Math.abs(d) <= 60 ? "ok" : "bad"}
                  style={{ height: `${Math.min(100, 8 + Math.abs(d))}%` }}
                  title={`${d > 0 ? "+" : ""}${d} ms`} />
          ))}
        </div>
      )}

      {phase === "done" && !result && (
        <p className="error">
          Zu wenige Anschläge erkannt (mindestens {MIN_TAPS}). Etwas kräftiger anschlagen oder das Noisegate
          unter Einstellungen niedriger stellen.
        </p>
      )}
      {phase === "done" && result && (
        <div className="optimize-result">
          <p>
            Deine Anschläge liegen im Mittel <strong>{Math.abs(result.offsetMs)} ms {result.offsetMs >= 0 ? "nach" : "vor"}</strong>{" "}
            dem Klick (Streuung ±{result.spreadMs} ms, {result.deviations.length} von {result.deviations.length + result.missed} Schlägen erkannt).
          </p>
          {result.spreadMs > 40 && (
            <p className="hint">Die Streuung ist recht groß – für einen verlässlichen Wert lieber noch einmal messen.</p>
          )}
          {applied ? (
            <p className="hint">Übernommen: Timing-Ausgleich jetzt {result.offsetMs} ms.</p>
          ) : result.offsetMs === offsetMs ? (
            <p className="hint">Das entspricht bereits dem eingestellten Timing-Ausgleich.</p>
          ) : (
            <div className="recorder-actions">
              <button className="primary" onClick={() => { onApply(result.offsetMs); setApplied(true); }}>
                Als Timing-Ausgleich übernehmen ({result.offsetMs} ms)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
