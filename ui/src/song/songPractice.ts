// Lied als Notenquelle: Einstellungen, Zuordnung der Liedtöne zur eigenen Stimmung, Stimmungsvorschlag.

import { api } from "../api";
import type { Instrument } from "../instruments";
import { presetTuning, tuningPresets, type Tuning } from "../music/tunings";
import type { Target } from "../practice/generator";
import type { UiSettings } from "../practice/settings";
import type { SongNote, SongTrack } from "./gpImport";

export type NoteSource = "random" | "song";

export interface RecentSong {
  path: string;
  name: string;
}

export interface SongSettings {
  source: NoteSource;
  path: string; // zuletzt gewähltes Lied ("" = keins)
  name: string;
  track: number; // -1 = nach dem Laden passend zum Instrument wählen
  barFrom: number; // 0-basiert, inklusive
  barTo: number; // inklusive; -1 = bis zum Ende
  loop: boolean; // am Ende von vorn
  recent: RecentSong[];
}

const DEFAULTS: SongSettings = { source: "random", path: "", name: "", track: 0, barFrom: 0, barTo: -1, loop: false, recent: [] };
const MAX_RECENT = 8;

export function songOf(ui: UiSettings): SongSettings {
  const s = (ui["practice.song"] ?? {}) as Partial<SongSettings>;
  return {
    ...DEFAULTS,
    ...s,
    source: s.source === "song" ? "song" : "random",
    recent: Array.isArray(s.recent) ? s.recent.slice(0, MAX_RECENT) : [],
  };
}

export function saveSong(ui: UiSettings, s: SongSettings): UiSettings {
  api.setUiSetting("practice.song", s);
  return { ...ui, "practice.song": s };
}

/** Lied an die Spitze der Liste „zuletzt geöffnet“ setzen. */
export const withRecent = (recent: RecentSong[], song: RecentSong) =>
  [song, ...recent.filter((r) => r.path !== song.path)].slice(0, MAX_RECENT);

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const sameTuning = (a: number[], b: number[]) => a.length === b.length && a.every((m, i) => m === b[i]);

/** Griffstelle für einen Ton auf dem eigenen Instrument: möglichst tiefer Bund (null = nicht spielbar). */
export function lowestPosition(inst: Instrument, midi: number): { string: number; fret: number } | null {
  let best: { string: number; fret: number } | null = null;
  inst.strings.forEach((s, i) => {
    const fret = midi - s.midi;
    if (fret >= 0 && fret <= inst.frets && (!best || fret < best.fret)) best = { string: i, fret };
  });
  return best;
}

export interface SongTargets {
  targets: Target[];
  unplayable: number; // Töne, die auf dem Instrument in dieser Stimmung nicht vorkommen (ausgelassen)
  ownPositions: boolean; // Griffstellen aus dem Lied (gleiche Stimmung) statt selbst bestimmt
}

/** Liedtöne im Taktbereich als Zielnoten. Bei gleicher Stimmung gelten die Griffstellen aus dem Lied;
    Töne, die auf dem Instrument nicht vorkommen, entfallen. */
export function songTargets(notes: SongNote[], songTuning: number[], tuned: Instrument, barFrom: number, barTo: number): SongTargets {
  const own = sameTuning(songTuning, tuned.strings.map((s) => s.midi));
  const targets: Target[] = [];
  let unplayable = 0;
  for (const n of notes) {
    if (n.bar < barFrom || (barTo >= 0 && n.bar > barTo)) continue;
    const pos = own ? { string: n.string, fret: n.fret } : lowestPosition(tuned, n.midi);
    if (!pos) {
      unplayable++;
      continue;
    }
    targets.push({ midi: n.midi, flat: n.flat, bar: n.bar, legato: n.legato, ...pos });
  }
  return { targets, unplayable, ownPositions: own };
}

/** Passendste Spur für das Instrument: gleiche Stimmung, sonst gleiche Saitenzahl, dann der Name
    („Bass“ beim Bass); Spuren ohne Saiten und Schlagzeug nie. -1 = keine geeignete Spur. */
export function suggestTrack(tracks: SongTrack[], tuned: Instrument): number {
  const own = tuned.strings.map((s) => s.midi);
  const bass = tuned.id.startsWith("bass");
  let best = -1, bestScore = -1;
  for (const t of tracks) {
    if (t.percussion || t.tuning.length === 0) continue;
    const named = /bass/i.test(t.name) === bass ? 1 : 0;
    const score = (sameTuning(t.tuning, own) ? 4 : t.tuning.length === own.length ? 2 : 0) + named;
    if (score > bestScore) {
      best = t.index;
      bestScore = score;
    }
  }
  return best;
}

/** Stimmung der Liedspur als eigene Stimmung (gleiche Saitenzahl, höchstens 7 Halbtöne je Saite). */
export function tuningFromSong(instrument: Instrument, songTuning: number[]): Tuning | null {
  if (songTuning.length !== instrument.strings.length) return null;
  const offsets = songTuning.map((m, i) => m - instrument.strings[i].midi);
  if (offsets.some((o) => Math.abs(o) > 7)) return null;
  const preset = tuningPresets(instrument).find((p) => presetTuning(instrument, p.id).offsets.every((o, i) => o === offsets[i]));
  return { id: preset?.id ?? "custom", offsets };
}
