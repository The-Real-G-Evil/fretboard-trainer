// Getakteter Modus: Metronom läuft, jede Note fällt auf einen festen Zeitpunkt und wird
// innerhalb eines Toleranzfensters bewertet (SPEC Abschnitt 3).
//
// Zeiten: Noten- und Schlag-Ereignisse tragen Zeitstempel auf derselben Stream-Uhr des
// Audio-Kerns. Ein Anschlag wird um die Latenz (Klick hören → Ton erfasst) korrigiert.

import type { NoteEvent } from "../api";
import type { Difficulty } from "./engine";
import type { Target, TargetSource } from "./generator";
import { points } from "./scoring";

export type TempoId = "slow" | "medium" | "fast" | "veryFast";

export const TEMPOS: { id: TempoId; name: string; beatsPerNote: number }[] = [
  { id: "slow", name: "Langsam (Ganze)", beatsPerNote: 4 },
  { id: "medium", name: "Mittel (Halbe)", beatsPerNote: 2 },
  { id: "fast", name: "Schnell (Viertel)", beatsPerNote: 1 },
  { id: "veryFast", name: "Sehr schnell (Achtel)", beatsPerNote: 0.5 },
];

export const tempoById = (id: string) => TEMPOS.find((t) => t.id === id) ?? TEMPOS[1];

export interface TimedConfig {
  bpm: number;
  beatsPerNote: number;
  toleranceBeats: number; // halbe Fensterbreite, z. B. 0,25 = ±¼ Schlag („weich getaktet“)
  countInBeats: number; // Vorzähler
  compensationMs: number; // Latenz + eigener Ausgleich, wird von Anschlagszeiten abgezogen
  difficulty: Difficulty;
}

export type NoteResult =
  | { kind: "hit"; errorMs: number; points: number }
  | { kind: "missed" }; // Fenster verstrichen

export interface TimedNote extends Target {
  dueBeat: number;
  result?: NoteResult;
  wrongAttempts: number;
}

export type TimedFeedback =
  | { kind: "hit"; note: TimedNote; errorMs: number; points: number }
  | { kind: "wrong"; note: TimedNote; played: number; octaveOff: boolean }
  | { kind: "early"; note: TimedNote; played: number }
  | { kind: "missed"; note: TimedNote };

export interface TimedStats {
  hits: number;
  misses: number; // falscher Ton, zu früh oder verpasst
  streak: number;
  bestStreak: number;
  score: number;
  timingErrorsMs: number[]; // je Treffer: + = zu spät, − = zu früh
}

export interface TimedState {
  config: TimedConfig;
  anchorMs: number | null; // Zeit von Schlag 0 (erster Metronom-Schlag)
  notes: TimedNote[];
  cursor: number; // erste noch offene Note
  lastHitMidi: number | null;
  stats: TimedStats;
  last: TimedFeedback | null;
}

const LOOKAHEAD = 8; // so viele Noten ab dem Cursor stehen fest

export const beatMs = (c: TimedConfig) => 60000 / c.bpm;
export const windowMs = (c: TimedConfig) => c.toleranceBeats * beatMs(c);
export const dueMs = (s: TimedState, n: TimedNote) => (s.anchorMs ?? 0) + n.dueBeat * beatMs(s.config);

function extend(notes: TimedNote[], cursor: number, config: TimedConfig, source: TargetSource) {
  const out = [...notes];
  while (out.length - cursor < LOOKAHEAD) {
    const prev = out.length > 0 ? out[out.length - 1] : null;
    const t = source(prev);
    if (!t) break;
    const dueBeat = prev ? prev.dueBeat + config.beatsPerNote : config.countInBeats;
    out.push({ ...t, dueBeat, wrongAttempts: 0 });
  }
  return out;
}

export function startTimed(config: TimedConfig, source: TargetSource): TimedState {
  return {
    config,
    anchorMs: null,
    notes: extend([], 0, config, source),
    cursor: 0,
    lastHitMidi: null,
    stats: { hits: 0, misses: 0, streak: 0, bestStreak: 0, score: 0, timingErrorsMs: [] },
    last: null,
  };
}

/** Der erste Schlag nach dem Start ist Schlag 0 und legt die Zeitachse fest (die Zählung des
    Metronoms spielt keine Rolle – es kann schon vorher gelaufen sein). */
export function onBeat(s: TimedState, beat: { timeMs: number }): TimedState {
  if (s.anchorMs !== null) return s;
  return { ...s, anchorMs: beat.timeMs };
}

function miss(stats: TimedStats): TimedStats {
  return { ...stats, misses: stats.misses + 1, streak: 0 };
}

/** Schließt Noten ab, deren Fenster vor `nowMs` (Stream-Uhr, unkorrigiert) zu Ende ist. */
export function expire(s: TimedState, nowMs: number, source: TargetSource): TimedState {
  if (s.anchorMs === null) return s;
  const t = nowMs - s.config.compensationMs;
  let { cursor, stats, last } = s;
  const notes = [...s.notes];

  while (cursor < notes.length && t > dueMs(s, notes[cursor]) + windowMs(s.config)) {
    notes[cursor] = { ...notes[cursor], result: { kind: "missed" } };
    stats = miss(stats);
    last = { kind: "missed", note: notes[cursor] };
    cursor++;
  }

  if (cursor === s.cursor) return s;
  return { ...s, notes: extend(notes, cursor, s.config, source), cursor, stats, last };
}

/** Bewertet einen erkannten Ton gegen die aktuelle Note. */
export function onTimedNote(s: TimedState, note: NoteEvent, source: TargetSource,
                            pointsFactor = 1): TimedState {
  if (s.anchorMs === null) return s;

  const current = s.notes[s.cursor];
  if (!current) return s;

  // Nachklingender, gerade getroffener Ton: kein Fehler (die nächste Note ist nie dieselbe)
  if (note.midi === s.lastHitMidi && note.midi !== current.midi) return s;

  const t = note.timeMs - s.config.compensationMs;
  const due = dueMs(s, current);
  const win = windowMs(s.config);

  if (t < due - win) {
    // Vor dem Fenster: richtiger Ton zu früh oder Ton mitten in der Pause
    return { ...s, stats: miss(s.stats), last: { kind: "early", note: current, played: note.midi } };
  }

  if (note.midi !== current.midi) {
    const notes = [...s.notes];
    notes[s.cursor] = { ...current, wrongAttempts: current.wrongAttempts + 1 };
    return {
      ...s,
      notes,
      stats: miss(s.stats),
      last: { kind: "wrong", note: current, played: note.midi, octaveOff: (note.midi - current.midi) % 12 === 0 },
    };
  }

  // Treffer im Fenster (ein Ton nach dem Fenster kommt hier nicht an: expire() hat die Note schon abgeschlossen)
  const errorMs = t - due;
  const streak = s.stats.streak + 1;
  const accuracy = 1 - Math.abs(errorMs) / win;
  const p = Math.round(points(accuracy, streak, s.config.difficulty) * pointsFactor);
  const notes = [...s.notes];
  notes[s.cursor] = { ...current, result: { kind: "hit", errorMs, points: p } };
  const cursor = s.cursor + 1;

  return {
    ...s,
    notes: extend(notes, cursor, s.config, source),
    cursor,
    lastHitMidi: current.midi,
    stats: {
      hits: s.stats.hits + 1,
      misses: s.stats.misses,
      streak,
      bestStreak: Math.max(s.stats.bestStreak, streak),
      score: s.stats.score + p,
      timingErrorsMs: [...s.stats.timingErrorsMs, errorMs],
    },
    last: { kind: "hit", note: current, errorMs, points: p },
  };
}

/** Mittlerer Timingfehler und Streuung der Treffer (für „du spielst eher zu früh/spät“). */
export function timingSummary(errors: number[]) {
  if (errors.length === 0) return { meanMs: 0, absMeanMs: 0 };
  const meanMs = errors.reduce((a, b) => a + b, 0) / errors.length;
  const absMeanMs = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
  return { meanMs, absMeanMs };
}
