// Notennamen (deutsch mit H statt B, englisch mit B).

import { getLang } from "../i18n";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "H"];

/** Notenname (deutsch H, englisch B) mit wissenschaftlicher Oktavzahl, z. B. 40 -> "E2". */
export function noteName(midi: number) {
  const pc = ((midi % 12) + 12) % 12;
  return { name: localNoteName(NOTE_NAMES[pc]), octave: Math.floor(midi / 12) - 1 };
}

/** Deutschen Tonnamen in die eingestellte Sprache bringen: englisch H -> B, B (= B♭) -> B♭. */
export function localNoteName(name: string): string {
  if (getLang() === "de") return name;
  return name.replace(/\bB(?!♭)/g, "B♭").replace(/H/g, "B");
}
