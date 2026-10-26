// Stimmungen: Vorlagen je Instrument und freie Stimmung pro Saite (SPEC Abschnitt 2).

import { noteName } from "./names";
import { withRange, type Instrument } from "../instruments";
import { t, tKey } from "../i18n";

export interface Tuning {
  id: string; // Vorlagen-Id oder "custom"
  offsets: number[]; // Halbtöne je Saite relativ zur Standardstimmung (tiefste Saite zuerst)
}

interface TuningPreset {
  id: string;
  name: string;
  offsets: (stringCount: number) => number[];
}

const all = (n: number, v: number) => Array.from({ length: n }, () => v);
const lowestDown = (n: number, lowest: number, rest: number) => [lowest, ...all(n - 1, rest)];

const GUITAR: TuningPreset[] = [
  { id: "standard", name: "Standard", offsets: (n) => all(n, 0) },
  { id: "dropD", name: "Drop D", offsets: (n) => lowestDown(n, -2, 0) },
  { id: "eb", name: tKey("Es-Stimmung (½ tiefer)"), offsets: (n) => all(n, -1) },
  { id: "dStandard", name: tKey("D-Standard (1 Ton tiefer)"), offsets: (n) => all(n, -2) },
  { id: "dropC", name: "Drop C", offsets: (n) => lowestDown(n, -4, -2) },
  { id: "bStandard", name: tKey("H-Standard"), offsets: (n) => all(n, -5) },
  { id: "dadgad", name: "DADGAD", offsets: (n) => (n === 6 ? [-2, 0, 0, 0, -2, -2] : all(n, 0)) },
  { id: "openG", name: "Open G", offsets: (n) => (n === 6 ? [-2, -2, 0, 0, 0, -2] : all(n, 0)) },
];

const BASS: TuningPreset[] = [
  { id: "standard", name: "Standard", offsets: (n) => all(n, 0) },
  { id: "dropD", name: "Drop D", offsets: (n) => (n === 4 ? lowestDown(n, -2, 0) : all(n, 0)) },
  { id: "eb", name: tKey("Es-Stimmung (½ tiefer)"), offsets: (n) => all(n, -1) },
  { id: "dStandard", name: tKey("D-Standard (1 Ton tiefer)"), offsets: (n) => all(n, -2) },
  { id: "bead", name: tKey("BEAD (H-E-A-D)"), offsets: (n) => (n === 4 ? all(n, -5) : all(n, 0)) },
];

const OTHER: TuningPreset[] = [{ id: "standard", name: "Standard", offsets: (n) => all(n, 0) }];

export function tuningPresets(instrument: Instrument): TuningPreset[] {
  const list = instrument.id.startsWith("guitar") ? GUITAR : instrument.id.startsWith("bass") ? BASS : OTHER;
  // Vorlagen, die für diese Saitenzahl nichts ändern, nicht doppelt anbieten; Namen in der eingestellten Sprache
  return list.filter((p, i) => i === 0 || p.offsets(instrument.strings.length).some((o) => o !== 0))
    .map((p) => ({ ...p, name: t(p.name) }));
}

export const standardTuning = (instrument: Instrument): Tuning => ({
  id: "standard",
  offsets: all(instrument.strings.length, 0),
});

export function presetTuning(instrument: Instrument, presetId: string): Tuning {
  const preset = tuningPresets(instrument).find((p) => p.id === presetId) ?? tuningPresets(instrument)[0];
  return { id: preset.id, offsets: preset.offsets(instrument.strings.length) };
}

export function tuningName(instrument: Instrument, tuning: Tuning) {
  if (tuning.id === "custom") return t("Eigene Stimmung");
  return tuningPresets(instrument).find((p) => p.id === tuning.id)?.name ?? "Standard";
}

/** Gültige Stimmung für das Instrument (z. B. nach Wechsel der Saitenzahl). */
export function normaliseTuning(instrument: Instrument, tuning: Tuning | undefined): Tuning {
  if (!tuning || tuning.offsets.length !== instrument.strings.length) return standardTuning(instrument);
  return tuning;
}

/** Instrument in der gewählten Stimmung: Saiten, Namen und Standard-Tonbereich angepasst. */
export function tunedInstrument(instrument: Instrument, tuning: Tuning): Instrument {
  const t = normaliseTuning(instrument, tuning);
  if (t.offsets.every((o) => o === 0)) return instrument;
  const strings = instrument.strings.map((s, i) => {
    const midi = s.midi + t.offsets[i];
    return { midi, name: noteName(midi).name };
  });
  return withRange({ ...instrument, strings });
}
