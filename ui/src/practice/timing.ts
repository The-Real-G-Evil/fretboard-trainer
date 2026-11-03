// Einstellungen für Spielmodus und Tempo (instrumentübergreifend), dauerhaft im Kern gespeichert.

import { api } from "../api";
import type { Difficulty } from "./engine";
import { DEFAULT_DYNAMICS_WINDOW, DYNAMICS_WINDOWS } from "./dynamics";
import { tempoById, type TempoId } from "./timed";
import type { UiSettings } from "./settings";
import { tKey } from "../i18n";

export type ModeChoice = "auto" | "wait" | "timed" | "rhythm" | "songPlay" | "songWait";
/** songPlay/songWait: Song-Modus mit Wiedergabe und echten Notenlängen (nur mit Lied).
    rhythm: Töne aus Zufall/Tonleiter mit echten Notenlängen, gespielt wie ein Lied (frei wählbar). */
export type PlayMode = "wait" | "timed" | "rhythm" | "songPlay" | "songWait";

/** Wie großzügig das Zeitfenster bewertet: Faktor auf das Fenster der Stufe und Mindestbreite in ms. */
export type Tolerance = "strict" | "normal" | "generous";

export interface TimingSettings {
  mode: ModeChoice;
  tolerance: Tolerance;
  tempo: TempoId;
  bpm: number;
  volumeDb: number; // Metronom
  offsetMs: number; // eigener Timing-Ausgleich zusätzlich zur Treiber-Latenz (+ = Anschläge früher werten)
  adaptive: boolean; // schwierige Töne öfter (aus der Statistik)
  diagnose: boolean; // Durchgänge als Diagnose-Aufnahme speichern
  dynamics: boolean; // Lautstärke bewerten (gleichmäßige Anschläge)
  dynamicsWindowDb: number; // Fenster ± dB
  dynamicsAuto: boolean; // nach gutem Durchgang automatisch enger
}

const DEFAULTS: TimingSettings = {
  mode: "auto", tolerance: "normal", tempo: "medium", bpm: 70, volumeDb: -10, offsetMs: 0, adaptive: true, diagnose: false,
  dynamics: false, dynamicsWindowDb: DEFAULT_DYNAMICS_WINDOW, dynamicsAuto: true,
};

export const MODE_CHOICES: { id: ModeChoice; name: string }[] = [
  { id: "auto", name: tKey("Nach Stufe") },
  { id: "wait", name: tKey("Warten") },
  { id: "timed", name: tKey("Getaktet") },
  { id: "rhythm", name: tKey("Rhythmus (Notenlängen)") },
  { id: "songPlay", name: tKey("Lied mitspielen") },
  { id: "songWait", name: tKey("Lied wartet auf dich") },
];

export const TOLERANCE_CHOICES: { id: Tolerance; name: string; factor: number; minMs: number }[] = [
  { id: "strict", name: tKey("Streng"), factor: 0.7, minMs: 60 },
  { id: "normal", name: tKey("Normal"), factor: 1, minMs: 100 },
  { id: "generous", name: tKey("Großzügig"), factor: 1.5, minMs: 150 },
];

export const isSongMode = (m: ModeChoice) => m === "songPlay" || m === "songWait";

/** Spielmodi für die Notenquelle: Song-Modi nur mit Lied; Rhythmus und Warten nur ohne (beim Lied übernehmen das
    die Song-Modi mit Noten, Tabulatur und Wiedergabe). */
export const modeAvailable = (m: ModeChoice, fromSong: boolean) =>
  (isSongMode(m) ? fromSong : m === "rhythm" || m === "wait" ? !fromSong : true);

/** Standard-Spielmodus folgt dem Schwierigkeitsgrad (SPEC Abschnitt 3), manuell überschreibbar. */
export function playMode(choice: ModeChoice, difficulty: Difficulty, fromSong = false): PlayMode {
  if (choice !== "auto" && modeAvailable(choice, fromSong)) return choice;
  if (difficulty === "veryEasy" || difficulty === "easy") return fromSong ? "songWait" : "wait";
  return "timed";
}

/** Toleranzfenster (halbe Breite in Schlägen): bis „Mittel“ weich ±¼, „Schwer“ mittel ±0,15,
    „Hammer-ons und Pull-offs“ eng ±0,1.
    Die Toleranz-Einstellung skaliert das Fenster; bei bekanntem Tempo (bpm, wie gespielt) hat es eine Mindestbreite
    in ms, damit es bei hohem Tempo nicht zu schmal wird. Höchstens ±½ Schlag. */
export function toleranceBeats(difficulty: Difficulty, tolerance: Tolerance = "normal", bpm?: number): number {
  const choice = TOLERANCE_CHOICES.find((c) => c.id === tolerance) ?? TOLERANCE_CHOICES[1];
  const beats = (difficulty === "veryHard" ? 0.1 : difficulty === "hard" ? 0.15 : 0.25) * choice.factor;
  const floor = bpm && bpm > 0 ? choice.minMs / (60000 / bpm) : 0;
  return Math.min(0.5, Math.max(beats, floor));
}

export function timingOf(ui: UiSettings): TimingSettings {
  const stored = (ui["practice.timing"] ?? {}) as Partial<TimingSettings>;
  return {
    mode: MODE_CHOICES.some((m) => m.id === stored.mode) ? stored.mode! : DEFAULTS.mode,
    tolerance: TOLERANCE_CHOICES.some((c) => c.id === stored.tolerance) ? stored.tolerance! : DEFAULTS.tolerance,
    tempo: tempoById(stored.tempo ?? DEFAULTS.tempo).id,
    bpm: Math.min(220, Math.max(30, Number(stored.bpm ?? DEFAULTS.bpm))),
    volumeDb: Math.min(6, Math.max(-60, Number(stored.volumeDb ?? DEFAULTS.volumeDb))),
    offsetMs: Math.min(300, Math.max(-300, Number(stored.offsetMs ?? DEFAULTS.offsetMs))),
    adaptive: stored.adaptive ?? DEFAULTS.adaptive,
    diagnose: stored.diagnose ?? DEFAULTS.diagnose,
    dynamics: stored.dynamics ?? DEFAULTS.dynamics,
    dynamicsWindowDb: DYNAMICS_WINDOWS.includes(Number(stored.dynamicsWindowDb))
      ? Number(stored.dynamicsWindowDb) : DEFAULTS.dynamicsWindowDb,
    dynamicsAuto: stored.dynamicsAuto ?? DEFAULTS.dynamicsAuto,
  };
}

export function saveTiming(ui: UiSettings, t: TimingSettings): UiSettings {
  api.setUiSetting("practice.timing", t);
  return { ...ui, "practice.timing": t };
}
