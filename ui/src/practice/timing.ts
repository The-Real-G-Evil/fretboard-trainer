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

export interface TimingSettings {
  mode: ModeChoice;
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
  mode: "auto", tempo: "medium", bpm: 70, volumeDb: -10, offsetMs: 0, adaptive: true, diagnose: false,
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
    „Hammer-ons und Pull-offs“ eng ±0,1. */
export const toleranceBeats = (difficulty: Difficulty) =>
  difficulty === "veryHard" ? 0.1 : difficulty === "hard" ? 0.15 : 0.25;

export function timingOf(ui: UiSettings): TimingSettings {
  const stored = (ui["practice.timing"] ?? {}) as Partial<TimingSettings>;
  return {
    mode: MODE_CHOICES.some((m) => m.id === stored.mode) ? stored.mode! : DEFAULTS.mode,
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
