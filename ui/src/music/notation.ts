// Notenschrift-Logik: Schlüssel, Schreibweise und Position im Fünfliniensystem.
// Bis Stufe „Mittel“ kommen nur Stammtöne vor, ab „Schwer“ auch Töne mit ♯ oder ♭ (SPEC Abschnitt 3).
// Ohne Tonart: jedes Vorzeichen steht direkt vor seiner Note.

import { getLang, tKey } from "../i18n";

export type ClefId = "treble" | "treble8vb" | "bass" | "bass8vb" | "alto" | "tenor";

export interface Clef {
  id: ClefId;
  name: string;
  glyph: string; // Zeichen aus dem Unicode-Block „Musical Symbols“ (Schrift: Noto Music)
  bottomLine: number; // diatonischer Index der untersten Linie (geschriebene Tonhöhe)
  anchorLine: number; // Linie (0 = unten … 4 = oben), auf der der Schlüssel sitzt
  baselineOffset: number; // Grundlinie der Schrift unter der Bezugslinie, in Linienabständen (Glyphen vermessen)
  octaveShift: number; // Halbtöne, um die notiert wird über dem Klang (8vb: +12)
}

/** Diatonischer Index eines Stammtons: Oktave * 7 + Stufe (C = 0 … H = 6). */
export const diatonic = (letter: number, octave: number) => octave * 7 + letter;

export const CLEFS: Clef[] = [
  { id: "treble", name: tKey("Violinschlüssel"), glyph: "\u{1D11E}", bottomLine: diatonic(2, 4), anchorLine: 1, baselineOffset: 0, octaveShift: 0 },
  { id: "treble8vb", name: tKey("Violinschlüssel, oktavierend (8vb)"), glyph: "\u{1D120}", bottomLine: diatonic(2, 4), anchorLine: 1, baselineOffset: 0, octaveShift: 12 },
  { id: "bass", name: tKey("Bassschlüssel"), glyph: "\u{1D122}", bottomLine: diatonic(4, 2), anchorLine: 3, baselineOffset: 2.6, octaveShift: 0 },
  { id: "bass8vb", name: tKey("Bassschlüssel, oktavierend (8vb)"), glyph: "\u{1D124}", bottomLine: diatonic(4, 2), anchorLine: 3, baselineOffset: 2.6, octaveShift: 12 },
  { id: "alto", name: tKey("Altschlüssel"), glyph: "\u{1D121}", bottomLine: diatonic(3, 3), anchorLine: 2, baselineOffset: 2, octaveShift: 0 },
  { id: "tenor", name: tKey("Tenorschlüssel"), glyph: "\u{1D121}", bottomLine: diatonic(1, 3), anchorLine: 3, baselineOffset: 2, octaveShift: 0 },
];

export const clefById = (id: string) => CLEFS.find((c) => c.id === id) ?? CLEFS[0];

// Halbtonstufe -> Stammton-Stufe (null = kein Stammton)
const LETTER_OF_PC: (number | null)[] = [0, null, 1, null, 2, 3, null, 4, null, 5, null, 6];
const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "H"];
const LETTER_NAMES_EN = ["C", "D", "E", "F", "G", "A", "B"];
const letterName = (letter: number) => (getLang() === "de" ? LETTER_NAMES : LETTER_NAMES_EN)[letter];

export const isNatural = (midi: number) => LETTER_OF_PC[((midi % 12) + 12) % 12] !== null;

export interface Spelled {
  letter: number; // 0 = C … 6 = H
  octave: number; // wissenschaftliche Oktave des Stammtons (C4 = eingestrichenes c)
  accidental: -1 | 0 | 1; // ♭ / keins / ♯
  name: string; // in der eingestellten Sprache: deutsch "F♯", "E♭", B♭ = "B", H; englisch B♭ = "B♭", H = "B"
}

export const ACCIDENTAL_GLYPH: Record<-1 | 1, string> = { [-1]: "\u266D", 1: "\u266F" };

/** Schreibweise eines Stammtons; wirft bei Tönen mit Vorzeichen. */
export function spellNatural(midi: number): Spelled {
  const letter = LETTER_OF_PC[((midi % 12) + 12) % 12];
  if (letter === null) throw new Error(`Kein Stammton: ${midi}`);
  return { letter, octave: Math.floor(midi / 12) - 1, accidental: 0, name: letterName(letter) };
}

/** Schreibweise eines beliebigen Tons: Stammton, sonst mit ♯ (Standard) oder ♭. */
export function spell(midi: number, flat = false): Spelled {
  if (isNatural(midi)) return spellNatural(midi);
  if (flat) {
    const base = spellNatural(midi + 1);
    // Deutsch: B♭ heißt „B“ (H ist B natur)
    // (englisch: „B♭“)
    const name = base.letter === 6 && getLang() === "de" ? "B" :`${base.name}\u266D`;
    return { ...base, accidental: -1, name };
  }
  const base = spellNatural(midi - 1);
  return { ...base, accidental: 1, name: `${base.name}\u266F` };
}

/** Position im System: 0 = unterste Linie, 1 = erster Zwischenraum, … 8 = oberste Linie.
    Negative Werte und Werte über 8 brauchen Hilfslinien. */
export function staffStep(soundingMidi: number, clef: Clef, flat = false): number {
  const s = spell(soundingMidi + clef.octaveShift, flat);
  return diatonic(s.letter, s.octave) - clef.bottomLine;
}

/** Hilfslinien (als Systemschritte) für eine Note auf `step`. */
export function ledgerLines(step: number): number[] {
  const lines: number[] = [];
  for (let s = -2; s >= step; s -= 2) lines.push(s);
  for (let s = 10; s <= step; s += 2) lines.push(s);
  return lines;
}

/** Üblicher Schlüssel für ein Instrument (Gitarre/Bass oktavierend notiert). */
export function defaultClef(instrumentId: string): ClefId {
  if (instrumentId.startsWith("guitar")) return "treble8vb";
  if (instrumentId.startsWith("bass")) return "bass8vb";
  if (instrumentId === "viola") return "alto";
  if (instrumentId === "cello") return "bass";
  return "treble";
}
