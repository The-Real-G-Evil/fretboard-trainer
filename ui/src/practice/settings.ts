// Übungseinstellungen je Instrument (Stimmung, Schlüssel, Übungsbereich), dauerhaft im Kern gespeichert.

import { api } from "../api";
import type { Instrument } from "../instruments";
import { defaultClef, type ClefId, CLEFS } from "../music/notation";
import { normaliseTuning, type Tuning } from "../music/tunings";
import { clampRange, fullRange, type PracticeRange } from "./generator";
import { difficultyById, type Difficulty } from "./engine";

export interface InstrumentPractice {
  tuning: Tuning;
  clef: ClefId;
  range: PracticeRange;
}

export type UiSettings = Record<string, unknown>;

const key = (instrumentId: string) => `practice.${instrumentId}`;

/** Einstellungen für das Instrument; fehlende oder unpassende Werte werden durch Standards ersetzt. */
export function practiceFor(ui: UiSettings, instrument: Instrument): InstrumentPractice {
  const stored = (ui[key(instrument.id)] ?? {}) as Partial<InstrumentPractice>;
  const clef = CLEFS.some((c) => c.id === stored.clef) ? stored.clef! : defaultClef(instrument.id);
  return {
    tuning: normaliseTuning(instrument, stored.tuning),
    clef,
    range: clampRange(instrument, stored.range ?? fullRange(instrument, 5)),
  };
}

export function savePractice(ui: UiSettings, instrumentId: string, p: InstrumentPractice): UiSettings {
  api.setUiSetting(key(instrumentId), p);
  return { ...ui, [key(instrumentId)]: p };
}

export const difficultyOf = (ui: UiSettings): Difficulty => difficultyById(String(ui["practice.difficulty"] ?? "")).id;

export function saveDifficulty(ui: UiSettings, d: Difficulty): UiSettings {
  api.setUiSetting("practice.difficulty", d);
  return { ...ui, "practice.difficulty": d };
}
