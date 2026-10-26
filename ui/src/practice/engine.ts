// Übungs-Engine, Warte-Modus: die nächste Note erscheint erst nach dem richtigen Ton (SPEC Abschnitt 3).

import type { ChordEvent, NoteEvent } from "../api";
import { judgeChord, type ChordScore } from "./chords";
import { targetMidis, type Target, type TargetSource } from "./generator";
import { points, reactionAccuracy } from "./scoring";
import { tKey } from "../i18n";

export type Difficulty = "veryEasy" | "easy" | "medium" | "hard" | "veryHard";

export interface DifficultyInfo {
  id: Difficulty;
  name: string;
  showName: boolean; // Notenname anzeigen
  showFretboard: boolean; // Griffstelle mit Fingersatz auf dem Griffbrett anzeigen
  showNoteChart: boolean; // Griffbrett mit allen Tonnamen als Nachschlagehilfe
  naturalsOnly: boolean; // nur Stammtöne (bis „Mittel“), sonst auch ♯/♭
  legato: boolean; // vereinzelt Hammer-on/Pull-off (Stufe „Hammer-ons und Pull-offs“)
}

/** Gebundene Note angeschlagen statt Hammer-on/Pull-off: richtiger Ton, aber nur so viele Punkte. */
export const PICKED_LEGATO_FACTOR = 0.5;

export const DIFFICULTIES: DifficultyInfo[] = [
  { id: "veryEasy", name: tKey("Sehr leicht"), showName: true, showFretboard: true, showNoteChart: true, naturalsOnly: true, legato: false },
  { id: "easy", name: tKey("Leicht"), showName: true, showFretboard: false, showNoteChart: true, naturalsOnly: true, legato: false },
  { id: "medium", name: tKey("Mittel"), showName: false, showFretboard: false, showNoteChart: false, naturalsOnly: true, legato: false },
  { id: "hard", name: tKey("Schwer"), showName: false, showFretboard: false, showNoteChart: false, naturalsOnly: false, legato: false },
  { id: "veryHard", name: tKey("Hammer-ons und Pull-offs"), showName: false, showFretboard: false, showNoteChart: false, naturalsOnly: false, legato: true },
];

/** Stufe zur Id; die frühere Stufe „Ultra“ (gespeicherte Einstellung, Statistik) gilt als letzte Stufe. */
export const difficultyById = (id: string) =>
  DIFFICULTIES.find((d) => d.id === (id === "ultra" ? "veryHard" : id)) ?? DIFFICULTIES[0];

export const PREVIEW = 3; // so viele kommende Noten stehen schon im System

/** Spielbarer Tonbereich eines Instruments (tiefste Leersaite bis höchster Bund der höchsten Saite). */
export function playableRange(inst: { strings: { midi: number }[]; frets: number }): [number, number] {
  const midis = inst.strings.map((s) => s.midi);
  return [Math.min(...midis), Math.max(...midis) + inst.frets];
}

/** So viel leiser als die letzten Anschläge ist ein erkannter Ton kein echter Anschlag, sondern eine
    mitschwingende Saite oder ein Griffgeräusch (Diagnose-Aufnahmen: echte Anschläge höchstens
    ~12 dB unter dem Median, solche Fehlerkennungen 17–35 dB). */
export const WEAK_NOTE_DB = 15;

/** Bezugspegel für WEAK_NOTE_DB: Median der letzten gewerteten Anschläge. */
export class LevelReference {
  private levels: number[] = [];

  add(note: NoteEvent) {
    if (note.onsetType !== "pick" || note.levelDb === undefined) return;
    this.levels.push(note.levelDb);
    if (this.levels.length > 8) this.levels.shift();
  }

  /** undefined, solange zu wenige Anschläge bekannt sind (dann gilt die Pegelregel noch nicht). */
  value(): number | undefined {
    if (this.levels.length < 3) return undefined;
    const sorted = [...this.levels].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

/** Erkannte Töne, die beim Üben nicht als Versuch zählen (bis Stufe „Mittel“):
    - Legato-Meldungen, die nicht den gesuchten Ton treffen: bis „Mittel“ wird jeder Ton
      angeschlagen, ein Tonwechsel ohne Anschlag stammt von einer aus- oder mitklingenden Saite.
    - Töne außerhalb des spielbaren Bereichs der eingestellten Stimmung: Griffgeräusche oder
      Abdämpfen, als (sehr tiefer) Ton gedeutet (z. B. D♯1 auf einem EADG-Bass).
    - Falsche Töne, die viel leiser sind als die letzten Anschläge (referenceDb, WEAK_NOTE_DB).
      Der gesuchte Ton zählt auch leise – außer er ist erst durch die Korrektur anhand des
      erwarteten Tons entstanden (dann war es eine umgedeutete Fehlerkennung). */
export function ignoredNote(note: NoteEvent, targetMidi: number | undefined, playable: [number, number],
                            referenceDb?: number) {
  const weak = referenceDb !== undefined && note.levelDb !== undefined && note.levelDb < referenceDb - WEAK_NOTE_DB;
  if (note.midi === targetMidi) return weak && note.corrected === true;
  if (note.onsetType === "legato" || weak) return true;
  return note.midi < playable[0] || note.midi > playable[1];
}

export interface Stats {
  hits: number;
  misses: number;
  streak: number;
  bestStreak: number;
  score: number;
  reactionMs: number[]; // je Treffer: Zeit vom Erscheinen der Note bis zum richtigen Ton
}

export type Feedback =
  | { kind: "hit"; target: Target; reactionMs: number; cents: number; inTune: boolean; points: number; picked: boolean;
      chord?: ChordScore }
  | { kind: "miss"; target: Target; played: number; octaveOff: boolean }
  | { kind: "chordMiss"; target: Target; missing: number[] }; // zu wenige Akkordtöne

export interface PracticeState {
  queue: Target[]; // [aktuelle Note, ...Vorschau]
  shownAt: number; // Zeitpunkt, seit dem die aktuelle Note gilt
  lastHitMidi: number | null; // zuletzt getroffener Ton (klingt evtl. noch nach)
  stats: Stats;
  last: Feedback | null;
}

const emptyStats = (): Stats => ({ hits: 0, misses: 0, streak: 0, bestStreak: 0, score: 0, reactionMs: [] });

function fillQueue(queue: Target[], source: TargetSource, last: Target | null) {
  const q = [...queue];
  while (q.length < 1 + PREVIEW) {
    const t = source(q.length > 0 ? q[q.length - 1] : last);
    if (!t) break;
    q.push(t);
  }
  return q;
}

export function startPractice(source: TargetSource, now: number): PracticeState {
  return { queue: fillQueue([], source, null), shownAt: now, lastHitMidi: null, stats: emptyStats(), last: null };
}

/** Verarbeitet einen erkannten Ton. Nur Anschläge und Legato-Töne zählen; die Oktave muss stimmen.
    Ein erneut gemeldeter, gerade getroffener Ton (Nachklingen, Abdämpfen, kurzer Aussetzer) zählt
    nicht als Fehler bei der nächsten Note – die nächste Note ist nie dieselbe wie die vorige. */
export function onPlayedNote(
  state: PracticeState,
  note: NoteEvent,
  centsTolerance: number,
  source: TargetSource,
  now: number,
  difficulty: Difficulty = "veryEasy",
  pointsFactor = 1, // z. B. Lautstärke-Bewertung (nur für Treffer)
): PracticeState {
  const target = state.queue[0];
  if (!target || target.chord) return state; // Akkord: bewertet onPlayedChord aus der Akkordprüfung

  if (note.midi === state.lastHitMidi && note.midi !== target.midi) return state;

  if (note.midi === target.midi) {
    const picked = !!target.legato && note.onsetType === "pick"; // gebunden verlangt, aber angeschlagen
    return hitTarget(state, source, now, difficulty, pointsFactor * (picked ? PICKED_LEGATO_FACTOR : 1),
                     { cents: note.cents, inTune: Math.abs(note.cents) <= centsTolerance, picked });
  }

  return {
    ...state,
    stats: { ...state.stats, misses: state.stats.misses + 1, streak: 0 },
    last: { kind: "miss", target, played: note.midi, octaveOff: (note.midi - target.midi) % 12 === 0 },
  };
}

function hitTarget(
  state: PracticeState, source: TargetSource, now: number, difficulty: Difficulty, factor: number,
  detail: { cents: number; inTune: boolean; picked: boolean; chord?: ChordScore },
): PracticeState {
  const target = state.queue[0];
  const reactionMs = Math.max(0, now - state.shownAt);
  const streak = state.stats.streak + 1;
  const p = Math.round(points(reactionAccuracy(reactionMs), streak, difficulty) * factor);
  return {
    queue: fillQueue(state.queue.slice(1), source, target),
    shownAt: now,
    lastHitMidi: target.midi,
    stats: {
      hits: state.stats.hits + 1,
      misses: state.stats.misses,
      streak,
      bestStreak: Math.max(state.stats.bestStreak, streak),
      score: state.stats.score + p,
      reactionMs: [...state.stats.reactionMs, reactionMs],
    },
    last: { kind: "hit", target, reactionMs, points: p, ...detail },
  };
}

/** Verarbeitet die Akkordprüfung des Kerns, wenn die aktuelle Zielnote ein Akkord ist: genug
    Akkordtöne für die Stufe = Treffer (Punkte anteilig), sonst ein Fehler. */
export function onPlayedChord(
  state: PracticeState, ev: ChordEvent, source: TargetSource, now: number, difficulty: Difficulty = "veryEasy",
): PracticeState {
  const target = state.queue[0];
  if (!target?.chord) return state;
  const v = judgeChord(ev, targetMidis(target), difficulty);
  if (!v) return state;
  if (!v.hit) {
    return {
      ...state,
      stats: { ...state.stats, misses: state.stats.misses + 1, streak: 0 },
      last: { kind: "chordMiss", target, missing: v.missing },
    };
  }
  const chord = { present: v.present, judged: v.judged };
  return hitTarget(state, source, now, difficulty, chord.present / Math.max(1, chord.judged),
                   { cents: 0, inTune: true, picked: false, chord });
}

export const accuracy = (s: Stats) => (s.hits + s.misses > 0 ? s.hits / (s.hits + s.misses) : 0);

export const meanReactionMs = (s: Stats) =>
  s.reactionMs.length > 0 ? s.reactionMs.reduce((a, b) => a + b, 0) / s.reactionMs.length : 0;
