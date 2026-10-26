// Tonleitern (SPEC: Tonleiter-Trainer): Arten, Grundtöne, Schreibweise und die Tonfolge mit Griffstellen
// im Übungsbereich.

import type { Instrument } from "../instruments";
import { nextTarget, type PracticeRange, type Random, type Target, type TargetSource } from "../practice/generator";
import { isNatural } from "./notation";
import { localNoteName } from "./names";
import { t, tKey } from "../i18n";

export interface ScaleType {
  id: string;
  name: string;
  steps: number[]; // Halbtöne über dem Grundton (aufsteigend, ohne Oktave)
  majorOffset: number; // Halbtöne vom Grundton zum Grundton der Dur-Tonart mit denselben Vorzeichen
}

export const SCALES: ScaleType[] = [
  { id: "major", name: tKey("Dur"), steps: [0, 2, 4, 5, 7, 9, 11], majorOffset: 0 },
  { id: "minor", name: tKey("Moll (natürlich)"), steps: [0, 2, 3, 5, 7, 8, 10], majorOffset: 3 },
  { id: "harmonicMinor", name: tKey("Moll (harmonisch)"), steps: [0, 2, 3, 5, 7, 8, 11], majorOffset: 3 },
  { id: "melodicMinor", name: tKey("Moll (melodisch)"), steps: [0, 2, 3, 5, 7, 9, 11], majorOffset: 3 },
  { id: "majorPentatonic", name: tKey("Dur-Pentatonik"), steps: [0, 2, 4, 7, 9], majorOffset: 0 },
  { id: "minorPentatonic", name: tKey("Moll-Pentatonik"), steps: [0, 3, 5, 7, 10], majorOffset: 3 },
  { id: "blues", name: "Blues", steps: [0, 3, 5, 6, 7, 10], majorOffset: 3 },
  { id: "dorian", name: tKey("Dorisch"), steps: [0, 2, 3, 5, 7, 9, 10], majorOffset: 10 },
  { id: "phrygian", name: tKey("Phrygisch"), steps: [0, 1, 3, 5, 7, 8, 10], majorOffset: 8 },
  { id: "lydian", name: tKey("Lydisch"), steps: [0, 2, 4, 6, 7, 9, 11], majorOffset: 7 },
  { id: "mixolydian", name: tKey("Mixolydisch"), steps: [0, 2, 4, 5, 7, 9, 10], majorOffset: 5 },
  { id: "locrian", name: tKey("Lokrisch"), steps: [0, 1, 3, 5, 6, 8, 10], majorOffset: 1 },
  { id: "chromatic", name: tKey("Chromatisch"), steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], majorOffset: 0 },
];

export const scaleById = (id: string) => SCALES.find((s) => s.id === id) ?? SCALES[0];

/** Grundtöne (Tonhöhenklasse 0 = C) mit üblicher deutscher Schreibweise. */
export const ROOTS = ["C", "C♯/D♭", "D", "E♭", "E", "F", "F♯/G♭", "G", "A♭", "A", "B", "H"];

// Dur-Tonarten mit ♭-Vorzeichen: F, B, Es, As, Des (Fis/Ges mit ♯)
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1]);

/** Töne mit Vorzeichen in dieser Tonleiter als ♭ schreiben (nach der Vorzeichnung der Tonart)? */
export const scaleUsesFlats = (root: number, scale: ScaleType) => FLAT_MAJORS.has((root + scale.majorOffset) % 12);

/** Liegt der Ton in der Tonleiter? */
export const inScale = (midi: number, root: number, scale: ScaleType) =>
  scale.steps.includes((((midi - root) % 12) + 12) % 12);

/** Tonnamen der Tonleiter (ohne Oktave), z. B. A-Moll-Pentatonik: A C D E G. */
export function scaleNoteNames(root: number, scale: ScaleType): string[] {
  const flat = scaleUsesFlats(root, scale);
  return scale.steps.map((s) => pcName((root + s) % 12, flat));
}

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "H"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B", "H"];
const pcName = (pc: number, flat: boolean) => localNoteName((flat ? FLAT_NAMES : SHARP_NAMES)[pc]);

/** Anzeigename, z. B. „A Moll-Pentatonik“. */
export const scaleLabel = (root: number, scale: ScaleType) =>
  `${pcName(root, scaleUsesFlats(root, scale))} ${t(scale.name)}`;

export type ScaleOrder = "up" | "down" | "upDown" | "random";

export const SCALE_ORDERS: { id: ScaleOrder; name: string }[] = [
  { id: "upDown", name: tKey("auf und ab") },
  { id: "up", name: tKey("aufwärts") },
  { id: "down", name: tKey("abwärts") },
  { id: "random", name: tKey("zufällig") },
];

/** Tonhöhen der Tonleiter im Übungsbereich: ab dem tiefsten Grundton, höchstens `octaves` Oktaven
    (0 = so weit der Bereich reicht), am Ende wieder auf einem Grundton, wenn möglich. */
export function scalePitches(available: Iterable<number>, root: number, scale: ScaleType, octaves: number): number[] {
  const all = [...new Set(available)].filter((m) => inScale(m, root, scale)).sort((a, b) => a - b);
  const isRoot = (m: number) => (((m - root) % 12) + 12) % 12 === 0;
  const start = all.findIndex(isRoot);
  if (start < 0) return all; // kein Grundton im Bereich: alle Leitertöne
  const top = octaves > 0 ? all[start] + 12 * octaves : Infinity;
  const out = all.slice(start).filter((m) => m <= top);
  // nicht mitten in der Oktave aufhören: bis zum letzten Grundton kürzen (wenn es mehr als einen gibt)
  let last = out.length - 1;
  while (last > 0 && !isRoot(out[last])) last--;
  return last > 0 ? out.slice(0, last + 1) : out;
}

/** Griffstellen für eine Tonfolge: möglichst in einer Lage, ohne große Sprünge auf dem Griffbrett
    (günstigster Weg über alle möglichen Griffstellen). */
export function fingerSequence(midis: number[], pitches: Map<number, Target[]>): Target[] {
  const options = midis.map((m) => pitches.get(m) ?? []).filter((o) => o.length > 0);
  if (options.length === 0) return [];
  // cost[i][j]: günstigster Weg bis Ton i auf Griffstelle j
  let cost = options[0].map((p) => p.fret * 0.1); // eher tiefe Lagen
  const from: number[][] = [options[0].map(() => -1)];
  for (let i = 1; i < options.length; i++) {
    const next: number[] = [];
    const back: number[] = [];
    for (const q of options[i]) {
      let best = Infinity, bestK = 0;
      options[i - 1].forEach((p, k) => {
        const c = cost[k] + moveCost(p, q);
        if (c < best) {
          best = c;
          bestK = k;
        }
      });
      next.push(best);
      back.push(bestK);
    }
    cost = next;
    from.push(back);
  }
  let j = cost.indexOf(Math.min(...cost));
  const out: Target[] = [];
  for (let i = options.length - 1; i >= 0; i--) {
    out.unshift(options[i][j]);
    j = from[i][j];
  }
  return out;
}

// Wechsel zwischen zwei Griffstellen: Lagenwechsel kosten viel, Saitensprünge etwas, die leere Saite
// zählt zu jeder Lage
function moveCost(p: Target, q: Target): number {
  const fretMove = p.fret === 0 || q.fret === 0 ? 0 : Math.abs(q.fret - p.fret);
  const stretch = Math.max(0, fretMove - 3) * 4; // mehr als vier Bünde Spanne: Lagenwechsel
  return fretMove * 0.5 + stretch + Math.abs(q.string - p.string) * 0.8;
}

/** Tonfolge zum Üben: Leitertöne in der gewählten Richtung mit Griffstellen und Schreibweise. */
export function scaleTargets(
  pitches: Map<number, Target[]>, root: number, scale: ScaleType, octaves: number, order: ScaleOrder, loop: boolean,
): Target[] {
  const up = scalePitches(pitches.keys(), root, scale, octaves);
  const midis = order === "down" ? [...up].reverse() : order === "upDown" ? [...up, ...up.slice(0, -1).reverse()] : up;
  const flat = scaleUsesFlats(root, scale);
  // auf und ab mit Wiederholung: den Grundton nicht doppelt (letzter Ton = erster Ton der nächsten Runde)
  const seq = loop && order === "upDown" && midis.length > 2 ? midis.slice(0, -1) : midis;
  return fingerSequence(seq, pitches).map((t) => (isNatural(t.midi) ? t : { ...t, flat }));
}

/** Alle Griffstellen der Leitertöne im Bereich (Zufallsreihenfolge, Anzeige auf dem Griffbrett). */
export function scalePositions(inst: Instrument, range: PracticeRange, root: number, scale: ScaleType): Map<number, Target[]> {
  const flat = scaleUsesFlats(root, scale);
  const byPitch = new Map<number, Target[]>();
  for (let s = range.strings[0]; s <= range.strings[1]; s++)
    for (let f = range.frets[0]; f <= range.frets[1]; f++) {
      const midi = inst.strings[s].midi + f;
      if (!inScale(midi, root, scale)) continue;
      const t: Target = isNatural(midi) ? { midi, string: s, fret: f } : { midi, string: s, fret: f, flat };
      byPitch.set(midi, [...(byPitch.get(midi) ?? []), t]);
    }
  return byPitch;
}

/** Zufällige Leitertöne (ggf. gewichtet), immer in der Schreibweise der Tonart. */
export const scaleRandomSource = (pitches: Map<number, Target[]>, random: Random, root: number, scale: ScaleType): TargetSource =>
  (previous) => {
    const t = nextTarget(pitches, previous?.midi ?? null, random);
    return t && !isNatural(t.midi) ? { ...t, flat: scaleUsesFlats(root, scale) } : t;
  };
