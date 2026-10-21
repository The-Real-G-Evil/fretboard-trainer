import { useEffect, useRef, useState } from "react";
import { api, noteName } from "../api";
import { Staff, type StaffNote } from "../components/Staff";
import type { Instrument } from "../instruments";
import { spell, type Clef } from "../music/notation";
import { accuracy, ignoredNote, LevelReference, meanReactionMs, onPlayedNote, playableRange, startPractice, type Difficulty, type DifficultyInfo, type PracticeState } from "./engine";
import type { Target, TargetSource } from "./generator";
import { logTargets } from "./diagnostics";
import { useSessionRecorder } from "./useSessionRecorder";
import type { InstrumentPractice } from "./settings";
import { TargetBoard } from "./TargetBoard";
import { dynamicsFactor } from "./dynamics";
import { DynamicsStats, LevelBadge, useDynamics, type DynamicsOptions } from "./DynamicsView";

interface WaitRunProps {
  tuned: Instrument;
  practice: InstrumentPractice;
  clef: Clef;
  level: DifficultyInfo;
  difficulty: Difficulty;
  pitches: Map<number, Target[]>;
  centsTolerance: number;
  source: TargetSource; // Zufall (ggf. gewichtet) oder Lied
  dynamics: DynamicsOptions;
  songName?: string; // Notenquelle Lied
}

const FEEDBACK_MS = 900;
/** Name mit Oktave; mit Ziel-Schreibweise (♯/♭) wie im Notensystem. */
export const formatName = (midi: number, flat?: boolean) => {
  const s = spell(midi, flat);
  return `${s.name}${noteName(midi).octave}`;
};

/** Warte-Modus: die nächste Note erscheint erst nach dem richtigen Ton. */
export function WaitRun({ tuned, practice, clef, level, difficulty, pitches, centsTolerance, source, dynamics, songName }: WaitRunProps) {
  const dyn = useDynamics(dynamics);
  const [state, setState] = useState<PracticeState>(() => startPractice(source, performance.now()));
  const scoreRef = useRef(0);
  const record = useSessionRecorder(
    { instrument: tuned.id, difficulty, mode: "wait", tempo: "", bpm: 0, dynamicsWindowDb: dynamics.on ? dynamics.windowDb : undefined,
      source: songName ? "gp" : "random", gpFile: songName },
    scoreRef,
  );
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const stateRef = useRef(state);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const playable = playableRange(tuned);
    const levels = new LevelReference();
    const off = api.onNote((note) => {
      if (ignoredNote(note, stateRef.current.queue[0]?.midi, playable, levels.value())) return;
      levels.add(note);
      const rating = dyn.rate(note, stateRef.current.queue[0]?.midi);
      const next = onPlayedNote(stateRef.current, note, centsTolerance, source, performance.now(), difficulty,
                                dynamicsFactor(rating));
      if (next === stateRef.current) return;
      stateRef.current = next;
      scoreRef.current = next.stats.score;

      // Versuch für die Statistik (Griffposition nur, wenn sie angezeigt wurde)
      const fb = next.last;
      if (fb) {
        const pos = level.showFretboard ? { string: fb.target.string, fret: fb.target.fret } : { string: -1, fret: -1 };
        if (fb.kind === "hit") dyn.hit(note, rating);
        record(fb.kind === "hit"
          ? { expectedMidi: fb.target.midi, ...pos, playedMidi: note.midi, cents: note.cents, reactionMs: fb.reactionMs,
              onsetType: note.onsetType, correct: true, noteTimeMs: note.timeMs,
              levelDb: note.levelDb, levelDevDb: rating?.deviationDb }
          : { expectedMidi: fb.target.midi, ...pos, playedMidi: fb.played, cents: note.cents, onsetType: note.onsetType,
              correct: false, noteTimeMs: note.timeMs });
      }
      setState(next);
      setFlash(next.last?.kind ?? null);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FEEDBACK_MS);
    });
    return () => {
      off();
      window.clearTimeout(flashTimer.current);
    };
  }, [pitches, centsTolerance, difficulty]);

  const current = state.queue[0];

  // Erwarteten Ton an den Kern melden (Oktavprüfung bei nachklingendem vorigem Ton)
  useEffect(() => {
    api.setExpectedNotes(current ? [current.midi] : []);
    logTargets(current ? [current.midi] : []);
  }, [current?.midi]);
  useEffect(() => () => void api.setExpectedNotes([]), []);

  const staffNotes: StaffNote[] = state.queue.map((t, i) => ({
    midi: t.midi,
    flat: t.flat,
    state: i === 0 ? (flash === "miss" ? "miss" : "current") : "upcoming",
    label: i === 0 && level.showName ? spell(t.midi, t.flat).name : undefined,
  }));
  const { last, stats } = state;

  return (
    <>
      <section className={`card wide-card practice-stage ${flash ?? ""}`} data-target={current?.midi}>
        <Staff clef={clef} notes={staffNotes} sizeFor={pitches.keys()} />
        <TargetBoard tuned={tuned} practice={practice} level={level} target={current} />
        <div className="practice-feedback" aria-live="polite">
          {last?.kind === "hit" && (
            <span className="ok">
              Richtig: {formatName(last.target.midi, last.target.flat)} · {(last.reactionMs / 1000).toFixed(2)} s · +{last.points}
              {!last.inTune && ` · ${last.cents > 0 ? "+" : ""}${last.cents.toFixed(0)} Cent – Stimmung prüfen?`}
            </span>
          )}
          {last?.kind === "hit" && dyn.on && <LevelBadge rating={dyn.last} windowDb={dyn.windowDb} />}
          {last?.kind === "miss" && (
            <span className="bad">
              Gespielt: {formatName(last.played)}
              {last.octaveOff ? " – richtiger Ton, aber falsche Oktave" : " – nochmal versuchen"}
            </span>
          )}
          {!last && <span className="hint">Bereit – spiel die erste Note.</span>}
          {!current && last && <span className="ok song-end">Ende des Lieds – {stats.hits} Treffer, {stats.misses} Fehler.</span>}
          {current?.bar !== undefined && <span className="hint song-bar">Takt {current.bar + 1}</span>}
        </div>
      </section>

      <section className="card wide-card">
        <div className="result-stats">
          <div className="accuracy good"><span>Punkte</span>{stats.score}</div>
          <div><span>Treffer</span>{stats.hits}</div>
          <div><span>Fehler</span>{stats.misses}</div>
          <div><span>Quote</span>{Math.round(accuracy(stats) * 100)} %</div>
          <div><span>Ø Reaktionszeit</span>{stats.hits > 0 ? `${(meanReactionMs(stats) / 1000).toFixed(2)} s` : "–"}</div>
          <div><span>Serie</span>{stats.streak}</div>
          <div><span>Beste Serie</span>{stats.bestStreak}</div>
          {dyn.on && <DynamicsStats summary={dyn.summary} />}
        </div>
      </section>
    </>
  );
}
