import { useEffect, useRef, useState } from "react";
import { api, noteName } from "../api";
import { Staff, type StaffNote } from "../components/Staff";
import type { Instrument } from "../instruments";
import type { Clef } from "../music/notation";
import { ignoredNote, LevelReference, playableRange, type Difficulty, type DifficultyInfo } from "./engine";
import type { Target, TargetSource } from "./generator";
import { logTargets } from "./diagnostics";
import { useSessionRecorder } from "./useSessionRecorder";
import type { InstrumentPractice } from "./settings";
import { TargetBoard } from "./TargetBoard";
import {
  beatMs, dueMs, expire, onBeat, onTimedNote, startTimed, tempoById, timingSummary, windowMs,
  type TimedState,
} from "./timed";
import { toleranceBeats, type TimingSettings } from "./timing";
import { formatName, slurOf } from "./WaitRun";
import { dynamicsFactor, type LevelRating } from "./dynamics";
import { DynamicsStats, LevelBadge, useDynamics, type DynamicsOptions } from "./DynamicsView";
import type { NoteEvent } from "../api";

interface TimedRunProps {
  tuned: Instrument;
  practice: InstrumentPractice;
  clef: Clef;
  level: DifficultyInfo;
  difficulty: Difficulty;
  pitches: Map<number, Target[]>;
  timing: TimingSettings;
  source: TargetSource; // Zufall (ggf. gewichtet) oder Lied
  dynamics: DynamicsOptions;
  songName?: string; // Notenquelle Lied
  songTrack?: number;
}

const COUNT_IN = 4;
const PREVIEW = 3;
const FEEDBACK_MS = 700;

/** Getakteter Modus: Metronom läuft, jede Note hat ihren Zeitpunkt; bewertet wird im Toleranzfenster. */
export function TimedRun({ tuned, practice, clef, level, difficulty, pitches, timing, source, dynamics, songName, songTrack }: TimedRunProps) {
  const dyn = useDynamics(dynamics);
  const [state, setState] = useState<TimedState>(() =>
    startTimed(
      {
        bpm: timing.bpm,
        beatsPerNote: tempoById(timing.tempo).beatsPerNote,
        toleranceBeats: toleranceBeats(difficulty),
        countInBeats: COUNT_IN,
        compensationMs: timing.offsetMs, // Treiber-Latenz kommt mit dem ersten Schlag dazu
        difficulty,
      },
      source,
    ),
  );
  const [now, setNow] = useState<number | null>(null); // Stream-Uhr in ms (geschätzt)
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const stateRef = useRef(state);
  const scoreRef = useRef(0);
  const record = useSessionRecorder(
    { instrument: tuned.id, difficulty, mode: "timed", tempo: timing.tempo, bpm: timing.bpm,
      dynamicsWindowDb: dynamics.on ? dynamics.windowDb : undefined, source: songName ? "gp" : "random", gpFile: songName, gpTrack: songTrack },
    scoreRef,
  );
  const lastBeat = useRef<{ timeMs: number; perf: number } | null>(null);
  const played = useRef<{ note: NoteEvent; rating?: LevelRating } | undefined>(undefined); // Ton, der gerade gewertet wird
  const flashTimer = useRef<number | undefined>(undefined);

  const commit = (next: TimedState) => {
    if (next === stateRef.current) return;
    const prevLast = stateRef.current.last;
    stateRef.current = next;
    scoreRef.current = next.stats.score;
    setState(next);
    if (next.last && next.last !== prevLast) {
      const fb = next.last;
      const pos = level.showFretboard ? { string: fb.note.string, fret: fb.note.fret } : { string: -1, fret: -1 };
      const p = fb.kind === "missed" ? undefined : played.current;
      const base = { expectedMidi: fb.note.midi, ...pos, bar: fb.note.bar, noteTimeMs: p?.note.timeMs };
      if (fb.kind === "hit" && p) dyn.hit(p.note, p.rating);
      record(
        fb.kind === "hit" ? { ...base, playedMidi: fb.note.midi, timingMs: fb.errorMs, correct: true,
                              levelDb: p?.note.levelDb, levelDevDb: p?.rating?.deviationDb }
        : fb.kind === "missed" ? { ...base, correct: false }
        : { ...base, playedMidi: fb.played, correct: false },
      );
      setFlash(next.last.kind === "hit" ? "hit" : "miss");
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FEEDBACK_MS);
    }
  };

  // Metronom an, Schläge und Töne auf derselben Uhr auswerten
  useEffect(() => {
    api.setMetronome({ on: true, bpm: timing.bpm, volumeDb: timing.volumeDb, beatsPerBar: 4 });

    const offBeat = api.onBeat((b) => {
      lastBeat.current = { timeMs: b.timeMs, perf: performance.now() };
      const s = stateRef.current;
      if (s.anchorMs === null) {
        // Latenz des Treibers erst jetzt bekannt
        const config = { ...s.config, compensationMs: timing.offsetMs + b.latencyMs };
        commit(onBeat({ ...s, config }, b));
      }
    });
    const playable = playableRange(tuned);
    const levels = new LevelReference();
    const offNote = api.onNote((n) => {
      const s = stateRef.current;
      if (ignoredNote(n, s.notes[s.cursor]?.midi, playable, levels.value())) return;
      levels.add(n);
      const rating = dyn.rate(n, s.notes[s.cursor]?.midi);
      played.current = { note: n, rating };
      commit(onTimedNote(s, n, source, dynamicsFactor(rating)));
      played.current = undefined;
    });

    let raf = 0;
    const loop = () => {
      const lb = lastBeat.current;
      if (lb) {
        const t = lb.timeMs + (performance.now() - lb.perf);
        setNow(t);
        commit(expire(stateRef.current, t, source));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      offBeat();
      offNote();
      window.clearTimeout(flashTimer.current);
      api.setMetronome({ on: false, bpm: timing.bpm, volumeDb: timing.volumeDb, beatsPerBar: 4 });
    };
  }, []);

  const { config, stats, last } = state;
  const current = state.notes[state.cursor];
  const bMs = beatMs(config);

  // Erwarteten Ton an den Kern melden (Oktavprüfung bei nachklingendem vorigem Ton)
  useEffect(() => {
    api.setExpectedNotes(current ? [current.midi] : []);
    logTargets(current ? [current.midi] : []);
  }, [current?.midi, current?.dueBeat]);
  useEffect(() => () => void api.setExpectedNotes([]), []);
  const countIn = state.anchorMs !== null && now !== null && current
    ? Math.ceil((dueMs(state, state.notes[0]) - (now - config.compensationMs)) / bMs)
    : null;
  const inCountIn = state.cursor === 0 && countIn !== null && countIn > 0 && countIn <= COUNT_IN;

  const staffNotes: StaffNote[] = state.notes.slice(state.cursor, state.cursor + 1 + PREVIEW).map((n, i) => ({
    midi: n.midi,
    flat: n.flat,
    slur: slurOf(n, state.notes[state.cursor + i - 1]?.midi),
    state: i === 0 ? (flash === "miss" ? "miss" : "current") : "upcoming",
    label: i === 0 && level.showName ? noteName(n.midi).name : undefined,
  }));
  const summary = timingSummary(stats.timingErrorsMs);

  return (
    <>
      <section className={`card wide-card practice-stage ${flash ?? ""}`} data-target={current?.midi}>
        <Staff clef={clef} notes={staffNotes} sizeFor={pitches.keys()} />
        <Timeline state={state} now={now} />
        <TargetBoard tuned={tuned} practice={practice} level={level} target={current} />
        <div className="practice-feedback" aria-live="polite">
          {state.anchorMs === null && <span className="hint">Metronom startet …</span>}
          {inCountIn && <span className="count-in">{countIn}</span>}
          {!inCountIn && last?.kind === "hit" && (
            <span className="ok">
              {formatName(last.note.midi, last.note.flat)} · {Math.abs(last.errorMs) < 15 ? "genau" : `${Math.round(Math.abs(last.errorMs))} ms ${last.errorMs < 0 ? "zu früh" : "zu spät"}`} · +{last.points}
              {last.picked && " · angeschlagen statt Hammer-on/Pull-off"}
            </span>
          )}
          {!inCountIn && last?.kind === "hit" && dyn.on && <LevelBadge rating={dyn.last} windowDb={dyn.windowDb} />}
          {!inCountIn && last?.kind === "wrong" && (
            <span className="bad">
              Gespielt: {formatName(last.played)}{last.octaveOff ? " – falsche Oktave" : ""}
            </span>
          )}
          {!inCountIn && last?.kind === "early" && <span className="bad">Zu früh – warte auf den Schlag</span>}
          {!inCountIn && last?.kind === "missed" && <span className="bad">Verpasst: {formatName(last.note.midi, last.note.flat)}</span>}
          {!current && state.notes.length > 0 && (
            <span className="ok song-end">Ende des Lieds – {stats.hits} Treffer, {stats.misses} Fehler.</span>
          )}
          {current?.bar !== undefined && !inCountIn && <span className="hint song-bar">Takt {current.bar + 1}</span>}
        </div>
      </section>

      <section className="card wide-card">
        <div className="result-stats">
          <div className="accuracy good"><span>Punkte</span>{stats.score}</div>
          <div><span>Treffer</span>{stats.hits}</div>
          <div><span>Fehler</span>{stats.misses}</div>
          <div><span>Quote</span>{stats.hits + stats.misses > 0 ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100) : 0} %</div>
          <div>
            <span>Ø Abweichung</span>
            {stats.hits > 0 ? `${Math.round(summary.absMeanMs)} ms` : "–"}
          </div>
          <div>
            <span>Tendenz</span>
            {stats.hits >= 4 ? (Math.abs(summary.meanMs) < 15 ? "genau" : `${Math.round(Math.abs(summary.meanMs))} ms ${summary.meanMs < 0 ? "zu früh" : "zu spät"}`) : "–"}
          </div>
          <div><span>Serie</span>{stats.streak}</div>
          <div><span>Beste Serie</span>{stats.bestStreak}</div>
          {dyn.on && <DynamicsStats summary={dyn.summary} />}
        </div>
        <p className="hint">
          {config.bpm} BPM · {tempoById(timing.tempo).name} · Fenster ±{Math.round(windowMs(config))} ms ·
          Latenzausgleich {Math.round(config.compensationMs)} ms
        </p>
      </section>
    </>
  );
}

/** Zeitleiste: Jetzt-Linie links, kommende Noten wandern auf sie zu; das Fenster ist hinterlegt. */
function Timeline({ state, now }: { state: TimedState; now: number | null }) {
  const W = 760, H = 46, nowX = 120;
  const bMs = beatMs(state.config);
  const pxPerMs = (W - nowX - 20) / (bMs * Math.max(4, state.config.beatsPerNote * 3));
  const t = now !== null ? now - state.config.compensationMs : null;
  const x = (ms: number) => nowX + (ms - (t ?? 0)) * pxPerMs;
  const win = windowMs(state.config);

  const beats: number[] = [];
  if (state.anchorMs !== null && t !== null) {
    const first = Math.floor((t - state.anchorMs) / bMs) - 1;
    for (let b = first; b < first + 16; b++) beats.push(state.anchorMs + b * bMs);
  }

  return (
    <svg className="timeline" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="tl-axis" />
      {beats.map((b) => {
        const bx = x(b);
        return bx > 0 && bx < W ? <line key={b} x1={bx} x2={bx} y1={H / 2 - 8} y2={H / 2 + 8} className="tl-beat" /> : null;
      })}
      {state.anchorMs !== null && t !== null &&
        state.notes.slice(Math.max(0, state.cursor - 2), state.cursor + 6).map((n, i) => {
          const due = dueMs(state, n);
          const cx = x(due);
          if (cx < -20 || cx > W + 20) return null;
          const cls = n.result ? n.result.kind : i + Math.max(0, state.cursor - 2) === state.cursor ? "current" : "upcoming";
          return (
            <g key={`${n.dueBeat}`} className={`tl-note ${cls}`}>
              <rect x={x(due - win)} y={H / 2 - 12} width={2 * win * pxPerMs} height={24} rx={5} />
              <circle cx={cx} cy={H / 2} r={6} />
            </g>
          );
        })}
      <line x1={nowX} x2={nowX} y1={2} y2={H - 2} className="tl-now" />
    </svg>
  );
}
