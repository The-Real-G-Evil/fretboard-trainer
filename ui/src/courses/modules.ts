// Kurse (Module): Ordner mit module.json und Übungsdateien (Guitar Pro oder alphaTex). Das Format ist in
// MODULE.md beschrieben; hier wird es gelesen, geprüft und in Einstellungen für die Übungsseite übersetzt.

import { clampTempo, type SongSettings } from "../song/songPractice";
import type { ModeChoice } from "../practice/timing";

export interface ModuleExercise {
  id: string;
  title: string;
  description?: string;
  file: string; // relativ zum Modulordner
  track: number; // Spur in der Datei (0 = erste)
  bars?: [number, number]; // Taktbereich, 1-basiert, inklusive
  mode: ModeChoice; // Spielmodus beim Start ("auto" = nach Stufe)
  loop: boolean;
  tempo?: { start: number; target?: number; step?: number }; // Prozent vom Tempo der Datei
}

export interface ModuleLesson {
  title: string;
  description?: string;
  exercises: ModuleExercise[];
}

export interface CourseModule {
  id: string;
  title: string;
  author?: string;
  description?: string;
  instrument?: string; // "bass", "guitar" oder eine Instrument-Id (z. B. "bass5"); leer = alle
  license?: string;
  version?: string;
  lessons: ModuleLesson[];
  path: string; // Modulordner
  folder: string; // Ordner, in dem das Modul gefunden wurde
  problems: string[]; // Hinweise zu fehlerhaften Angaben (das Modul bleibt nutzbar)
}

export interface ModuleEntry {
  path: string;
  folder: string;
  manifest?: unknown;
  error?: string;
}

const MODES: ModeChoice[] = ["auto", "timed", "songPlay", "songWait"];

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const folderName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;

/** Übungsdatei innerhalb des Modulordners (null: Pfad zeigt nach außen oder ist leer). */
export function exerciseFile(modulePath: string, file: string): string | null {
  const rel = file.trim().replace(/\\/g, "/");
  if (!rel || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel) || rel.split("/").includes("..")) return null;
  const sep = modulePath.includes("\\") ? "\\" : "/";
  return `${modulePath.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
}

/** module.json lesen und prüfen; Fehler einzelner Übungen landen in problems, die Übung entfällt. */
export function readModule(entry: ModuleEntry): CourseModule | { path: string; error: string } {
  if (entry.error || !entry.manifest || typeof entry.manifest !== "object")
    return { path: entry.path, error: entry.error ?? "module.json fehlt oder ist leer" };
  const m = entry.manifest as Record<string, unknown>;
  const problems: string[] = [];
  const lessons: ModuleLesson[] = [];
  const seen = new Set<string>();

  (Array.isArray(m.lessons) ? m.lessons : []).forEach((l, li) => {
    if (!l || typeof l !== "object") return void problems.push(`Lektion ${li + 1}: kein Objekt`);
    const lesson = l as Record<string, unknown>;
    const exercises: ModuleExercise[] = [];
    (Array.isArray(lesson.exercises) ? lesson.exercises : []).forEach((e, ei) => {
      const where = `Lektion ${li + 1}, Übung ${ei + 1}`;
      if (!e || typeof e !== "object") return void problems.push(`${where}: kein Objekt`);
      const ex = e as Record<string, unknown>;
      const file = text(ex.file);
      if (!file || !exerciseFile(entry.path, file)) return void problems.push(`${where}: Datei fehlt oder liegt außerhalb des Moduls`);
      const id = text(ex.id) ?? `${li + 1}-${ei + 1}`;
      if (seen.has(id)) return void problems.push(`${where}: Id „${id}“ doppelt`);
      seen.add(id);
      const bars = Array.isArray(ex.bars) && ex.bars.length === 2 && ex.bars.every((b) => Number.isInteger(b) && b >= 1)
        ? [Math.min(ex.bars[0], ex.bars[1]), Math.max(ex.bars[0], ex.bars[1])] as [number, number] : undefined;
      if (ex.bars !== undefined && !bars) problems.push(`${where}: „bars“ muss [von, bis] ab 1 sein`);
      const mode = MODES.includes(ex.mode as ModeChoice) ? (ex.mode as ModeChoice) : "auto";
      if (ex.mode !== undefined && mode !== ex.mode) problems.push(`${where}: unbekannter Spielmodus „${String(ex.mode)}“`);
      const t = ex.tempo && typeof ex.tempo === "object" ? ex.tempo as Record<string, unknown> : null;
      const tempo = t && typeof t.start === "number"
        ? {
            start: clampTempo(t.start),
            ...(typeof t.target === "number" ? { target: clampTempo(t.target) } : {}),
            ...(typeof t.step === "number" ? { step: t.step } : {}),
          }
        : undefined;
      exercises.push({
        id, title: text(ex.title) ?? `Übung ${ei + 1}`, description: text(ex.description), file,
        track: Number.isInteger(ex.track) && (ex.track as number) >= 0 ? (ex.track as number) : 0,
        bars, mode, loop: ex.loop === true, tempo,
      });
    });
    lessons.push({ title: text(lesson.title) ?? `Lektion ${li + 1}`, description: text(lesson.description), exercises });
  });
  if (lessons.length === 0) problems.push("keine Lektionen („lessons“)");

  return {
    id: text(m.id) ?? folderName(entry.path),
    title: text(m.title) ?? folderName(entry.path),
    author: text(m.author), description: text(m.description), instrument: text(m.instrument),
    license: text(m.license), version: text(m.version),
    lessons, path: entry.path, folder: entry.folder, problems,
  };
}

/** Schlüssel einer Übung in der Statistik. */
export const exerciseKey = (m: CourseModule, e: ModuleExercise) => `${m.id}/${e.id}`;

/** Passt das Modul zum Instrument? ("bass"/"guitar" = Familie, sonst genaue Id, leer = alle) */
export const instrumentMatches = (m: CourseModule, instrumentId: string) =>
  !m.instrument || instrumentId === m.instrument || instrumentId.startsWith(m.instrument);

/** Alle Übungen in Kursreihenfolge. */
export const allExercises = (m: CourseModule) => m.lessons.flatMap((l) => l.exercises.map((e) => ({ lesson: l, exercise: e })));

/** Lied-Einstellungen, mit denen die Übungsseite die Übung spielt. */
export function courseSongSettings(song: SongSettings, m: CourseModule, e: ModuleExercise): SongSettings {
  return {
    ...song,
    source: "song",
    path: exerciseFile(m.path, e.file) ?? "",
    name: e.title,
    track: e.track,
    barFrom: e.bars ? e.bars[0] - 1 : 0,
    barTo: e.bars ? e.bars[1] - 1 : -1,
    loop: e.loop,
    tempoPercent: e.tempo?.start ?? song.tempoPercent,
    ramp: e.tempo?.target
      ? { ...song.ramp, on: true, target: e.tempo.target, step: e.tempo.step ?? song.ramp.step }
      : { ...song.ramp, on: false },
  };
}

/** Die gerade geübte Kursübung (in den Oberflächen-Einstellungen, damit sie einen Neustart übersteht). */
export interface ActiveExercise {
  modulePath: string;
  moduleId: string;
  exerciseId: string;
  file: string; // vollständiger Pfad der Übungsdatei
}
