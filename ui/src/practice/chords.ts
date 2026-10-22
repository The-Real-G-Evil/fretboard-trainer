// Akkorde (SPEC: Erkennung, notengestützt): Bewertung je Akkordton aus der Akkordprüfung des Kerns.

import type { ChordEvent } from "../api";
import { spell } from "../music/notation";
import type { Difficulty } from "./engine";

/** So lange nach dem Anschlag kommt spätestens das Ergebnis der Akkordprüfung (Akkordfenster bis 170 ms,
    Verzögerung für spät angeschlagene Saiten, Übertragung): Akkorde erst danach als verpasst werten. */
export const CHORD_RESULT_MS = 300;

/** Akkord: angeschlagene von den einzeln prüfbaren Akkordtönen. */
export interface ChordScore {
  present: number;
  judged: number;
}

export interface ChordVerdict {
  hit: boolean; // genug Akkordtöne für die Stufe
  present: number; // angeschlagene Akkordtöne (nur einzeln prüfbare)
  judged: number; // einzeln prüfbare Akkordtöne
  missing: number[]; // fehlende Akkordtöne (MIDI)
}

const sameNotes = (a: number[], b: number[]) => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((m, i) => m === y[i]);
};

/** So viele der n prüfbaren Akkordtöne müssen klingen: bis „Leicht“ die Hälfte, „Mittel“ alle bis auf
    einen (ab drei Tönen), darüber alle. */
export function requiredTones(n: number, difficulty: Difficulty): number {
  if (difficulty === "veryEasy" || difficulty === "easy") return Math.max(1, Math.ceil(n / 2));
  if (difficulty === "medium") return n >= 3 ? n - 1 : n;
  return n;
}

/** Bewertung eines Akkordanschlags gegen den erwarteten Akkord (null = Ergebnis gehört zu anderen Tönen).
    Oktavverdopplungen (shared) lassen sich nicht einzeln prüfen und zählen nicht mit. */
export function judgeChord(ev: ChordEvent, expected: number[], difficulty: Difficulty): ChordVerdict | null {
  if (!sameNotes(ev.tones.map((t) => t.midi), expected)) return null;
  const own = ev.tones.filter((t) => !t.shared);
  const judged = own.length ? own : ev.tones;
  const present = judged.filter((t) => t.present).length;
  return {
    hit: present >= requiredTones(judged.length, difficulty),
    present,
    judged: judged.length,
    missing: judged.filter((t) => !t.present).map((t) => t.midi),
  };
}

// Akkordsymbole: Intervalle über dem Grundton (Tonhöhenklassen), häufigste zuerst
const CHORD_TYPES: [string, number[]][] = [
  ["", [0, 4, 7]], ["m", [0, 3, 7]], ["5", [0, 7]], ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]],
  ["sus4", [0, 5, 7]], ["sus2", [0, 2, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]], ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]],
  ["add9", [0, 2, 4, 7]], ["7sus4", [0, 5, 7, 10]], ["m7♭5", [0, 3, 6, 10]], ["dim7", [0, 3, 6, 9]],
];

/** Akkordsymbol (z. B. „Am“, „E5“, „G7“, „C/E“), sonst die Töne mit Bindestrich. */
export function chordSymbol(midis: number[], flat = false): string {
  const name = (pc: number) => spell(60 + pc, flat).name;
  const sorted = [...midis].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map((m) => m % 12))];
  const bass = sorted[0] % 12;
  // Grundton im Bass bevorzugen, sonst Umkehrung mit Basston
  for (const root of [bass, ...pcs.filter((p) => p !== bass)]) {
    const intervals = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    const type = CHORD_TYPES.find(([, iv]) => iv.length === intervals.length && iv.every((x, i) => x === intervals[i]));
    if (type) return `${name(root)}${type[0]}${root === bass ? "" : `/${name(bass)}`}`;
  }
  return sorted.map((m) => name(m % 12)).join("-");
}
