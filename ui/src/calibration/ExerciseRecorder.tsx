import { useEffect, useRef, useState } from "react";
import { api, noteName, type CalibrationTake, type DetectionConfig } from "../api";
import type { Instrument } from "../instruments";
import type { Exercise } from "./exercises";
import { Fretboard } from "./Fretboard";
import { InstrumentHint } from "./InstrumentHint";
import { NoteChip, type ChipState } from "./NoteChip";
import { TakeResult } from "./TakeResult";
import { t } from "../i18n";

type Phase = "ready" | "recording" | "saving" | "result";

const FINISH_DELAY_MS = 1200; // nach dem letzten Ton noch ausklingen lassen

interface ExerciseRecorderProps {
  exercise: Exercise;
  instrument: Instrument;
  detection: DetectionConfig; // Tonbereich des Instrument-Profils, gilt auch für die Auswertung
  gateThresholdDb: number;
  onSaved: (take: CalibrationTake) => void;
  onApplyGate: (db: number) => void;
  onSwitchInstrument: (id: string) => void;
  onClose: () => void;
}

export function ExerciseRecorder({ exercise, instrument, detection, gateThresholdDb, onSaved, onApplyGate, onSwitchInstrument, onClose }: ExerciseRecorderProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [cursor, setCursor] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<CalibrationTake | null>(null);
  const [mismatches, setMismatches] = useState<{ expected: number; detected: number }[]>([]);
  const cursorRef = useRef(0);
  const finishTimer = useRef<number | undefined>(undefined);
  const phaseRef = useRef<Phase>("ready");

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const finish = async () => {
    if (phaseRef.current !== "recording") return;
    window.clearTimeout(finishTimer.current);
    setPhaseBoth("saving");
    await api.stopRecording();
    const saved = await api.saveCalibrationTake({
      instrument: instrument.id,
      exerciseId: exercise.id,
      title: exercise.title,
      kind: exercise.kind,
      level: exercise.level,
      minHz: detection.minHz,
      maxHz: detection.maxHz,
      notes: exercise.notes.map((n) => ({ midi: n.midi, type: n.type })),
    });
    setTake(saved);
    setPhaseBoth("result");
    if (!saved.error) onSaved(saved);
  };

  const start = async () => {
    cursorRef.current = 0;
    setCursor(0);
    setWrong(null);
    setElapsed(0);
    setTake(null);
    setMismatches([]);
    await api.startRecording(`${exercise.id}-${Date.now()}`);
    setPhaseBoth("recording");
  };

  const cancel = async () => {
    window.clearTimeout(finishTimer.current);
    if (phaseRef.current === "recording") await api.stopRecording();
    setPhaseBoth("ready");
  };

  // Erwarteten Ton an den Kern melden (Oktavprüfung bei nachklingendem vorigem Ton)
  useEffect(() => {
    const next = phase === "recording" && exercise.kind === "notes" ? exercise.notes[cursor] : undefined;
    api.setExpectedNotes(next ? [next.midi] : []);
  }, [phase, cursor, exercise]);
  useEffect(() => () => void api.setExpectedNotes([]), []);

  // Live-Fortschritt: der Cursor rückt vor, wenn der erwartete Ton erkannt wurde
  useEffect(() => {
    if (phase !== "recording" || exercise.kind !== "notes") return;
    return api.onNote((n) => {
      const i = cursorRef.current;
      if (i >= exercise.notes.length) return;
      if (n.midi === exercise.notes[i].midi) {
        cursorRef.current = i + 1;
        setCursor(i + 1);
        setWrong(null);
        if (i + 1 === exercise.notes.length) finishTimer.current = window.setTimeout(finish, FINISH_DELAY_MS);
      } else {
        setWrong(n.midi);
        setMismatches((m) => [...m, { expected: exercise.notes[i].midi, detected: n.midi }]);
      }
    });
    // finish ist stabil genug: es liest nur Refs und Props dieser Übung
  }, [phase, exercise]);

  // Laufzeit; Ruhe-Messung endet automatisch
  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const sec = (performance.now() - startedAt) / 1000;
      setElapsed(sec);
      if (exercise.kind === "silence" && sec >= (exercise.durationSec ?? 4)) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, exercise]);

  // Beim Verlassen eine laufende Aufnahme beenden
  useEffect(() => () => {
    window.clearTimeout(finishTimer.current);
    if (phaseRef.current === "recording") api.stopRecording();
  }, []);

  const chipState = (i: number): ChipState =>
    phase !== "recording" ? "pending" : i < cursor ? "ok" : i === cursor ? (wrong !== null ? "wrong" : "current") : "pending";

  return (
    <div className="recorder">
      <div className="recorder-head">
        <div>
          <h3>{exercise.title}</h3>
          <p className="hint">{exercise.instructions}</p>
        </div>
        <button onClick={onClose} disabled={phase === "recording" || phase === "saving"}>{t("Zurück")}</button>
      </div>

      {phase === "recording" && (
        <InstrumentHint instrument={instrument} pairs={mismatches}
                        onSwitchInstrument={async (id) => { await cancel(); onSwitchInstrument(id); }} />
      )}

      {phase !== "result" && exercise.kind === "notes" && (
        <Fretboard instrument={instrument} notes={exercise.notes} states={exercise.notes.map((_, i) => chipState(i))}
                   currentIndex={phase === "recording" ? cursor : undefined} />
      )}

      {phase !== "result" && exercise.kind === "notes" && (
        <div className="chips">
          {exercise.notes.map((n, i) => (
            <NoteChip key={i} note={n} instrument={instrument} state={chipState(i)} />
          ))}
        </div>
      )}

      {phase === "ready" && (
        <div className="recorder-actions">
          <button className="primary" onClick={start}>
            {exercise.kind === "silence" ? t("Messung starten") : t("Aufnahme starten")}
          </button>
          <span className="hint">
            {exercise.kind === "silence"
              ? t("Dauer {s} s – bitte währenddessen nicht spielen.", { s: exercise.durationSec ?? 4 })
              : t("Spiel in deinem Tempo; der markierte Ton rückt vor, sobald er erkannt wurde.")}
          </span>
        </div>
      )}

      {phase === "recording" && (
        <div className="recorder-actions">
          <span className="rec-dot" aria-hidden /> <strong>{t("Aufnahme läuft")}</strong>
          <span className="hint">{elapsed.toFixed(1)} s</span>
          {exercise.kind === "notes" && (
            <span className="hint">
              {cursor} / {exercise.notes.length}
              {wrong !== null && " · " + t("erkannt: {note}", { note: `${noteName(wrong).name}${noteName(wrong).octave}` })}
            </span>
          )}
          {exercise.kind === "notes" && <button className="primary" onClick={finish}>{t("Fertig")}</button>}
          <button onClick={cancel}>{t("Abbrechen")}</button>
        </div>
      )}

      {phase === "saving" && <p className="hint">{t("Aufnahme wird gespeichert und ausgewertet …")}</p>}

      {phase === "result" && take && (
        <>
          <TakeResult take={take} exercise={exercise} instrument={instrument} gateThresholdDb={gateThresholdDb}
                      onApplyGate={onApplyGate} onSwitchInstrument={onSwitchInstrument} />
          <div className="recorder-actions">
            <button className="primary" onClick={start}>{t("Nochmal aufnehmen")}</button>
            <button onClick={onClose}>{t("Fertig")}</button>
          </div>
        </>
      )}
    </div>
  );
}
