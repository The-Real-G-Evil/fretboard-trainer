// Zufallsgenerator für Übungsnoten (Phase 3: gleichverteilt; adaptive Gewichtung folgt in Phase 4).

import type { Instrument } from "../instruments";
import { isNatural } from "../music/notation";

export interface PracticeRange {
  strings: [number, number]; // Saiten-Index von–bis (0 = tiefste)
  frets: [number, number]; // Bund von–bis
}

export interface Target {
  midi: number;
  string: number; // vorgeschlagene Griffstelle (für die Anzeige auf dem Griffbrett)
  fret: number;
  flat?: boolean; // Ton mit Vorzeichen als ♭ notieren (sonst ♯)
  seq?: number; // Position in einer festen Tonfolge (Lied)
  bar?: number; // Takt im Lied (0-basiert)
  legato?: boolean; // im Lied gebunden (Hammer-on/Pull-off)
}

/** Liefert die nächste Zielnote nach `previous` (null = erste); null = keine weitere (Liedende).
    Ohne eigenen Zustand: Wo es weitergeht, steht in der vorigen Note (seq). */
export type TargetSource = (previous: Target | null) => Target | null;

/** Zufällige Noten aus dem Übungsbereich (ggf. gewichtet). */
export const randomSource = (pitches: Map<number, Target[]>, random: Random): TargetSource =>
  (previous) => nextTarget(pitches, previous?.midi ?? null, random);

/** Feste Tonfolge, auf Wunsch endlos wiederholt. */
export function sequenceSource(notes: Target[], loop: boolean): TargetSource {
  return (previous) => {
    let i = previous?.seq === undefined ? 0 : previous.seq + 1;
    if (i >= notes.length) {
      if (!loop || notes.length === 0) return null;
      i = 0;
    }
    return { ...notes[i], seq: i };
  };
}

export const fullRange = (inst: Instrument, maxFret = 12): PracticeRange => ({
  strings: [0, inst.strings.length - 1],
  frets: [0, Math.min(maxFret, inst.frets)],
});

/** Gültiger Bereich für das Instrument (z. B. nach Wechsel der Saitenzahl). */
export function clampRange(inst: Instrument, r: PracticeRange | undefined): PracticeRange {
  if (!r) return fullRange(inst);
  const maxString = inst.strings.length - 1;
  const s0 = Math.max(0, Math.min(maxString, r.strings[0]));
  const s1 = Math.max(s0, Math.min(maxString, r.strings[1]));
  const f0 = Math.max(0, Math.min(inst.frets, r.frets[0]));
  const f1 = Math.max(f0, Math.min(inst.frets, r.frets[1]));
  return { strings: [s0, s1], frets: [f0, f1] };
}

/** Alle Griffstellen im Bereich, gruppiert nach Tonhöhe. Bis Stufe „Mittel“ nur Stammtöne. */
export function candidatePitches(inst: Instrument, range: PracticeRange, naturalsOnly: boolean) {
  const byPitch = new Map<number, Target[]>();
  for (let s = range.strings[0]; s <= range.strings[1]; s++) {
    for (let f = range.frets[0]; f <= range.frets[1]; f++) {
      const midi = inst.strings[s].midi + f;
      if (naturalsOnly && !isNatural(midi)) continue;
      if (!byPitch.has(midi)) byPitch.set(midi, []);
      byPitch.get(midi)!.push({ midi, string: s, fret: f });
    }
  }
  return byPitch;
}

/** Zufallszahl 0 <= x < 1; optional mit Gewichten je Ton für die adaptive Auswahl. */
export type Random = (() => number) & { weights?: ReadonlyMap<number, number> };

/** Zufallsquelle mit Gewichten (Töne ohne Gewicht zählen 1). */
export const weighted = (random: () => number, weights: ReadonlyMap<number, number>): Random =>
  Object.assign(() => random(), { weights });

/** Kleiner deterministischer Zufallsgenerator (für Tests und reproduzierbare Folgen). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wählt die nächste Note über die Tonhöhen (nicht über Griffstellen, sonst kämen Töne, die auf
    mehreren Saiten liegen, öfter dran), ohne direkte Wiederholung. Ohne Gewichte gleichverteilt,
    sonst proportional zum Gewicht (adaptive Auswahl). */
export function nextTarget(
  pitches: Map<number, Target[]>,
  previous: number | null,
  random: Random,
): Target | null {
  let midis = [...pitches.keys()];
  if (midis.length === 0) return null;
  if (midis.length > 1 && previous !== null) midis = midis.filter((m) => m !== previous);

  let midi = midis[Math.floor(random() * midis.length)];
  if (random.weights) {
    const w = midis.map((m) => Math.max(0, random.weights!.get(m) ?? 1));
    const total = w.reduce((a, b) => a + b, 0);
    if (total > 0) {
      let r = random() * total;
      midi = midis[midis.length - 1];
      for (let i = 0; i < midis.length; i++) {
        r -= w[i];
        if (r < 0) {
          midi = midis[i];
          break;
        }
      }
    }
  }
  const positions = pitches.get(midi)!;
  const position = positions[Math.floor(random() * positions.length)];
  // Töne mit Vorzeichen abwechselnd als ♯ und ♭ notieren, damit beide Schreibweisen geübt werden
  return isNatural(midi) ? position : { ...position, flat: random() < 0.5 };
}
