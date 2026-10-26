// Effektkette des Mithörens (Phase 9): Parameter, Regler-Beschreibung, Presets.

import { api } from "../api";
import type { UiSettings } from "../practice/settings";
import { tKey } from "../i18n";

export interface EffectParams {
  compressorOn: boolean; compThresholdDb: number; compRatio: number; compAttackMs: number; compReleaseMs: number; compMakeupDb: number;
  driveOn: boolean; driveMode: number; driveDb: number; driveTone: number; driveLevelDb: number; driveBlend: number;
  eqOn: boolean; eqBassDb: number; eqMidDb: number; eqMidHz: number; eqTrebleDb: number;
  chorusOn: boolean; chorusRateHz: number; chorusDepthMs: number; chorusMix: number;
  delayOn: boolean; delayMs: number; delayFeedback: number; delayMix: number;
  reverbOn: boolean; reverbSize: number; reverbDamping: number; reverbMix: number;
}

/** Wie im Kern (EffectParameters): alles aus. */
export const DEFAULT_EFFECTS: EffectParams = {
  compressorOn: false, compThresholdDb: -24, compRatio: 4, compAttackMs: 5, compReleaseMs: 150, compMakeupDb: 6,
  driveOn: false, driveMode: 0, driveDb: 18, driveTone: 0.5, driveLevelDb: -6, driveBlend: 0,
  eqOn: false, eqBassDb: 0, eqMidDb: 0, eqMidHz: 800, eqTrebleDb: 0,
  chorusOn: false, chorusRateHz: 0.8, chorusDepthMs: 3, chorusMix: 0.5,
  delayOn: false, delayMs: 350, delayFeedback: 0.35, delayMix: 0.3,
  reverbOn: false, reverbSize: 0.6, reverbDamping: 0.4, reverbMix: 0.25,
};

type NumberKey = { [K in keyof EffectParams]: EffectParams[K] extends number ? K : never }[keyof EffectParams];
type SwitchKey = { [K in keyof EffectParams]: EffectParams[K] extends boolean ? K : never }[keyof EffectParams];

export interface Knob {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export interface EffectUnit {
  id: string;
  name: string;
  on: SwitchKey;
  hint: string;
  knobs: Knob[];
}

const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(v % 1 ? 1 : 0)} dB`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
const ms = (v: number) => `${Math.round(v)} ms`;

/** Die Kette in Signalreihenfolge. */
export const UNITS: EffectUnit[] = [
  { id: "comp", name: tKey("Kompressor"), on: "compressorOn", hint: tKey("Gleicht laute und leise Anschläge an, mehr Sustain."), knobs: [
    { key: "compThresholdDb", label: tKey("Schwelle"), min: -60, max: 0, step: 1, format: db },
    { key: "compRatio", label: tKey("Verhältnis"), min: 1, max: 20, step: 0.5, format: (v) => `${v}:1` },
    { key: "compAttackMs", label: "Attack", min: 0.1, max: 100, step: 0.1, format: (v) => `${v.toFixed(1)} ms` },
    { key: "compReleaseMs", label: "Release", min: 10, max: 1000, step: 10, format: ms },
    { key: "compMakeupDb", label: tKey("Aufholen"), min: 0, max: 24, step: 0.5, format: db },
  ] },
  { id: "drive", name: tKey("Verzerrung"), on: "driveOn", hint: tKey("Overdrive (weich), Distortion (kräftiger), Fuzz (hart). Clean-Anteil hält beim Bass die Tiefen."), knobs: [
    { key: "driveMode", label: tKey("Art"), min: 0, max: 2, step: 1, format: (v) => ["Overdrive", "Distortion", "Fuzz"][v] ?? "" },
    { key: "driveDb", label: "Gain", min: 0, max: 40, step: 1, format: db },
    { key: "driveTone", label: tKey("Ton|Klang"), min: 0, max: 1, step: 0.01, format: pct },
    { key: "driveLevelDb", label: tKey("Pegel"), min: -24, max: 6, step: 0.5, format: db },
    { key: "driveBlend", label: tKey("Clean-Anteil"), min: 0, max: 1, step: 0.01, format: pct },
  ] },
  { id: "eq", name: "Equalizer", on: "eqOn", hint: tKey("Bässe (100 Hz), Mitten (einstellbar), Höhen (3 kHz)."), knobs: [
    { key: "eqBassDb", label: tKey("Bässe"), min: -12, max: 12, step: 0.5, format: db },
    { key: "eqMidDb", label: tKey("Mitten"), min: -12, max: 12, step: 0.5, format: db },
    { key: "eqMidHz", label: tKey("Mitten-Frequenz"), min: 200, max: 4000, step: 10, format: (v) => `${Math.round(v)} Hz` },
    { key: "eqTrebleDb", label: tKey("Höhen"), min: -12, max: 12, step: 0.5, format: db },
  ] },
  { id: "chorus", name: "Chorus", on: "chorusOn", hint: tKey("Schwebung und Stereobreite."), knobs: [
    { key: "chorusRateHz", label: "Tempo", min: 0.1, max: 5, step: 0.1, format: (v) => `${v.toFixed(1)} Hz` },
    { key: "chorusDepthMs", label: tKey("Tiefe"), min: 0, max: 10, step: 0.1, format: (v) => `${v.toFixed(1)} ms` },
    { key: "chorusMix", label: tKey("Anteil|Mix"), min: 0, max: 1, step: 0.01, format: pct },
  ] },
  { id: "delay", name: "Delay", on: "delayOn", hint: tKey("Echo; klingt nach dem Ausschalten aus."), knobs: [
    { key: "delayMs", label: tKey("Zeit"), min: 20, max: 2000, step: 5, format: ms },
    { key: "delayFeedback", label: tKey("Wiederholungen"), min: 0, max: 0.95, step: 0.01, format: pct },
    { key: "delayMix", label: tKey("Anteil|Mix"), min: 0, max: 1, step: 0.01, format: pct },
  ] },
  { id: "reverb", name: tKey("Hall"), on: "reverbOn", hint: tKey("Raum; klingt nach dem Ausschalten aus."), knobs: [
    { key: "reverbSize", label: tKey("Raumgröße"), min: 0, max: 1, step: 0.01, format: pct },
    { key: "reverbDamping", label: tKey("Dämpfung"), min: 0, max: 1, step: 0.01, format: pct },
    { key: "reverbMix", label: tKey("Anteil|Mix"), min: 0, max: 1, step: 0.01, format: pct },
  ] },
];

const preset = (patch: Partial<EffectParams>): EffectParams => ({ ...DEFAULT_EFFECTS, ...patch });

/** Eingebaute Presets (Gitarre und Bass). */
export const PRESETS: { name: string; params: EffectParams }[] = [
  { name: tKey("Trocken"), params: DEFAULT_EFFECTS },
  { name: tKey("Clean mit Hall"), params: preset({ compressorOn: true, compThresholdDb: -28, compRatio: 3, compMakeupDb: 5, reverbOn: true, reverbSize: 0.5, reverbMix: 0.2 }) },
  { name: "Crunch", params: preset({ driveOn: true, driveMode: 0, driveDb: 14, driveTone: 0.55, driveLevelDb: -4,
    eqOn: true, eqMidDb: 2, eqMidHz: 900, reverbOn: true, reverbSize: 0.35, reverbMix: 0.15 }) },
  { name: "Lead", params: preset({ compressorOn: true, compThresholdDb: -30, compRatio: 4, compMakeupDb: 6,
    driveOn: true, driveMode: 1, driveDb: 28, driveTone: 0.6, driveLevelDb: -10, eqOn: true, eqMidDb: 3, eqMidHz: 1000,
    delayOn: true, delayMs: 380, delayFeedback: 0.3, delayMix: 0.22, reverbOn: true, reverbSize: 0.45, reverbMix: 0.18 }) },
  { name: "Ambient", params: preset({ chorusOn: true, chorusRateHz: 0.5, chorusDepthMs: 4, chorusMix: 0.5,
    delayOn: true, delayMs: 450, delayFeedback: 0.45, delayMix: 0.35, reverbOn: true, reverbSize: 0.85, reverbDamping: 0.3, reverbMix: 0.4 }) },
  { name: "Bass clean", params: preset({ compressorOn: true, compThresholdDb: -24, compRatio: 4, compMakeupDb: 6,
    eqOn: true, eqBassDb: 3, eqMidDb: -2, eqMidHz: 500, eqTrebleDb: -1 }) },
  { name: "Bass Drive", params: preset({ compressorOn: true, compThresholdDb: -24, compRatio: 4, compMakeupDb: 4,
    driveOn: true, driveMode: 0, driveDb: 16, driveTone: 0.45, driveLevelDb: -6, driveBlend: 0.5 }) },
];

/** Gleiche Einstellungen (zum Erkennen, welches Preset gerade gilt). */
export const sameEffects = (a: EffectParams, b: EffectParams) =>
  (Object.keys(DEFAULT_EFFECTS) as (keyof EffectParams)[]).every((k) =>
    typeof a[k] === "number" ? Math.abs((a[k] as number) - (b[k] as number)) < 1e-4 : a[k] === b[k]);

/** Eigene Presets: Name -> Einstellungen (Oberflächen-Einstellung „effects.presets“). */
export function userPresets(ui: UiSettings): Record<string, EffectParams> {
  const raw = ui["effects.presets"];
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, Partial<EffectParams>>)
    .map(([name, p]) => [name, { ...DEFAULT_EFFECTS, ...p }]));
}

export function saveUserPresets(ui: UiSettings, presets: Record<string, EffectParams>): UiSettings {
  api.setUiSetting("effects.presets", presets);
  return { ...ui, "effects.presets": presets };
}
