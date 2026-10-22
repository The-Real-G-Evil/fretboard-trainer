// Punkte = Basispunkte × Timing-Genauigkeit × Combo × Stufenfaktor (SPEC Abschnitt 5).

import type { Difficulty } from "./engine";

export const BASE_POINTS = 100;

const LEVEL_FACTOR: Record<Difficulty, number> = { veryEasy: 1, easy: 1.25, medium: 1.5, hard: 2, veryHard: 2.5, ultra: 3 };

/** Combo-Faktor: +5 % je Treffer in Folge, höchstens +100 %. streak = Serie inkl. dieses Treffers. */
export const comboFactor = (streak: number) => 1 + Math.min(Math.max(streak - 1, 0), 20) * 0.05;

/** Genauigkeit 0..1 → Faktor 0,5..1 (auch knapp im Fenster gibt es noch die Hälfte). */
export const timingFactor = (accuracy: number) => 0.5 + 0.5 * Math.min(1, Math.max(0, accuracy));

/** Warte-Modus: Reaktionszeit statt Timing (bis 0,5 s volle Punkte, ab 3,5 s die Hälfte). */
export const reactionAccuracy = (reactionMs: number) => 1 - Math.min(1, Math.max(0, (reactionMs - 500) / 3000));

export function points(accuracy: number, streak: number, difficulty: Difficulty) {
  return Math.round(BASE_POINTS * timingFactor(accuracy) * comboFactor(streak) * LEVEL_FACTOR[difficulty]);
}
