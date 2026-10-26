import { useEffect, useRef, useState } from "react";
import { api, noteName, type NoteEvent, type PitchEvent } from "../api";
import { t } from "../i18n";

const HOLD_MS = 600; // letzte Note nach dem Ausklingen noch kurz stehen lassen
const MAX_LOG = 14;

interface TunerProps {
  centsTolerance: number;
  instrumentName: string;
}

export function Tuner({ centsTolerance, instrumentName }: TunerProps) {
  const [pitch, setPitch] = useState<PitchEvent | null>(null);
  const [stale, setStale] = useState(true);
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const lastVoiced = useRef(0);
  const lastMidi = useRef(-1);
  const smoothedCents = useRef(0);

  useEffect(() => {
    const offPitch = api.onPitch((p) => {
      const now = performance.now();
      if (p.midi >= 0) {
        // leichte Glaettung der Nadel, bei Notenwechsel sofort springen
        smoothedCents.current =
          lastMidi.current === p.midi ? smoothedCents.current * 0.6 + p.cents * 0.4 : p.cents;
        lastMidi.current = p.midi;
        lastVoiced.current = now;
        setPitch({ ...p, cents: smoothedCents.current });
        setStale(false);
      } else if (now - lastVoiced.current > HOLD_MS) {
        lastMidi.current = -1;
        setStale(true);
      }
    });
    const offNote = api.onNote((n) => setNotes((list) => [n, ...list].slice(0, MAX_LOG)));
    return () => {
      offPitch();
      offNote();
    };
  }, []);

  const inTune = pitch !== null && !stale && Math.abs(pitch.cents) <= centsTolerance;
  const needle = pitch && !stale ? Math.max(-50, Math.min(50, pitch.cents)) : 0;
  const display = pitch ? noteName(pitch.midi) : null;

  return (
    <div className="tuner-layout">
      <section className="card tuner-card">
        <h2>{t("Stimmgerät")} · {instrumentName}</h2>
        <div className={`tuner ${stale ? "stale" : ""} ${inTune ? "in-tune" : ""}`}>
          <div className="tuner-note">
            {display ? (
              <>
                {display.name}
                <sub>{display.octave}</sub>
              </>
            ) : (
              "–"
            )}
          </div>
          <div className="tuner-hz">{pitch && !stale ? `${pitch.hz.toFixed(2)} Hz` : t("kein Ton")}</div>

          <div className="tuner-scale" aria-label={t("Abweichung {c} Cent", { c: needle.toFixed(0) })}>
            <div
              className="tuner-zone"
              style={{ left: `${50 - centsTolerance}%`, width: `${2 * centsTolerance}%` }}
            />
            {[-50, -25, 0, 25, 50].map((c) => (
              <span key={c} className="tick" style={{ left: `${50 + c}%` }}>
                {c > 0 ? `+${c}` : c}
              </span>
            ))}
            <div className="needle" style={{ left: `${50 + needle}%` }} />
          </div>
          <div className="tuner-cents">
            {pitch && !stale ? `${pitch.cents >= 0 ? "+" : "−"}${Math.abs(pitch.cents).toFixed(1)} Cent` : " "}
          </div>
        </div>
      </section>

      <section className="card notes-card">
        <h2>{t("Erkannte Noten")}</h2>
        {notes.length === 0 ? (
          <p className="hint">{t("Spiel einen Ton – jede erkannte Note erscheint hier.")}</p>
        ) : (
          <table className="note-log">
            <thead>
              <tr>
                <th>{t("Zeit")}</th>
                <th>{t("Note")}</th>
                <th>Cent</th>
                <th>{t("Art")}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n, i) => {
                const nn = noteName(n.midi);
                return (
                  <tr key={`${n.timeMs}-${i}`} className={i === 0 ? "latest" : ""}>
                    <td>{(n.timeMs / 1000).toFixed(2)} s</td>
                    <td className="note-name">
                      {nn.name}
                      <sub>{nn.octave}</sub>
                    </td>
                    <td className={Math.abs(n.cents) <= centsTolerance ? "ok" : "off"}>
                      {n.cents >= 0 ? "+" : "−"}
                      {Math.abs(n.cents).toFixed(0)}
                    </td>
                    <td>
                      <span className={`onset ${n.onsetType}`}>{n.onsetType === "pick" ? t("Anschlag") : "Legato"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
