// Lied als Notenquelle: Einstellungen, Zuordnung der Liedtöne zur eigenen Stimmung, Stimmungsvorschlag.

import { api, type BarStat } from "../api";
import type { Instrument } from "../instruments";
import { presetTuning, tuningPresets, type Tuning } from "../music/tunings";
import type { Target } from "../practice/generator";
import type { UiSettings } from "../practice/settings";
import type { SongNote, SongTrack } from "./gpImport";

export type NoteSource = "random" | "song" | "scale";

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
  loopPasses: number; // Song-Modus: so viele Durchläufe beim Wiederholen (0 = endlos)
  songTempo: boolean; // getaktet im Tempo des Lieds (sonst eigenes BPM)
  tempoPercent: number; // Anteil am Liedtempo (auch Wiedergabetempo im Song-Modus)
  metronome: boolean; // Song-Modus: Metronom zur Wiedergabe
  mix: Record<string, TrackMix[]>; // Song-Modus: Mischpult je Lied (Pfad), je Spur
  recent: RecentSong[];
  ramp: TempoRamp; // Song-Modus: Tempo nach gelungenen Durchläufen steigern
}

/** Tempo steigern: nach einem Durchlauf mit mindestens minAccuracy % Treffern um step % schneller,
    bis target %. */
export interface TempoRamp {
  on: boolean;
  step: number;
  target: number;
  minAccuracy: number;
}

export const TEMPO_MIN = 20;
export const TEMPO_MAX = 150;
export const RAMP_STEPS = [2, 5, 10];
export const RAMP_ACCURACIES = [80, 90, 95, 100];

/** Tempo in Prozent: auf 5er-Schritte im erlaubten Bereich. */
export const clampTempo = (p: number) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(p / 5) * 5));

/** Neues Tempo nach einem Durchlauf (accuracy 0–1), null = bleibt. */
export function rampedTempo(current: number, accuracy: number, ramp: TempoRamp): number | null {
  if (!ramp.on || current >= ramp.target || accuracy * 100 < ramp.minAccuracy) return null;
  return Math.min(ramp.target, Math.min(TEMPO_MAX, current + ramp.step));
}

const DEFAULT_RAMP: TempoRamp = { on: false, step: 5, target: 100, minAccuracy: 90 };

export const LOOP_PASSES = [0, 2, 3, 4, 5, 8, 10];

export const TEMPO_PERCENTS = [25, 40, 50, 60, 70, 80, 90, 100, 110, 125];

/** Mischpult einer Spur: Lautstärke als Faktor zur Lautstärke im Lied (1 = unverändert). */
export interface TrackMix {
  volume: number;
  mute: boolean;
  solo: boolean;
}

export const MAX_TRACK_VOLUME = 1.5;
const OWN_TRACK_DEFAULT = 0.3; // eigene Spur leise zur Orientierung

/** Mischpult für ein Lied: gespeichert, sonst alle Spuren unverändert und die eigene leise. */
export function mixFor(song: SongSettings, trackCount: number): TrackMix[] {
  const stored = song.mix[song.path] ?? [];
  return Array.from({ length: trackCount }, (_, i) =>
    stored[i] ?? { volume: i === song.track ? OWN_TRACK_DEFAULT : 1, mute: false, solo: false });
}

/** Mischpult eines Lieds ändern (gespeichert unter dem Pfad; höchstens 20 Lieder). */
export function withMix(song: SongSettings, mix: TrackMix[]): SongSettings {
  const others = Object.entries(song.mix).filter(([p]) => p !== song.path).slice(-19);
  return { ...song, mix: { ...Object.fromEntries(others), [song.path]: mix } };
}

/** BPM für den getakteten Modus: Tempo am Anfang des Taktbereichs, skaliert. */
export const songBpm = (tempos: number[], barFrom: number, percent: number) =>
  tempos.length ? Math.max(30, Math.round((tempos[Math.min(barFrom, tempos.length - 1)] * percent) / 100)) : null;

const DEFAULTS: SongSettings = {
  source: "random", path: "", name: "", track: 0, barFrom: 0, barTo: -1, loop: false, loopPasses: 0, songTempo: true, tempoPercent: 100,
  metronome: false, mix: {}, recent: [], ramp: DEFAULT_RAMP,
};
const MAX_RECENT = 8;

export function songOf(ui: UiSettings): SongSettings {
  const s = (ui["practice.song"] ?? {}) as Partial<SongSettings>;
  return {
    ...DEFAULTS,
    ...s,
    source: s.source === "song" || s.source === "scale" ? s.source : "random",
    tempoPercent: Number.isFinite(Number(s.tempoPercent)) && s.tempoPercent !== undefined ? clampTempo(Number(s.tempoPercent)) : DEFAULTS.tempoPercent,
    ramp: {
      on: s.ramp?.on === true,
      step: RAMP_STEPS.includes(Number(s.ramp?.step)) ? Number(s.ramp?.step) : DEFAULT_RAMP.step,
      target: s.ramp?.target !== undefined ? clampTempo(Number(s.ramp.target) || DEFAULT_RAMP.target) : DEFAULT_RAMP.target,
      minAccuracy: RAMP_ACCURACIES.includes(Number(s.ramp?.minAccuracy)) ? Number(s.ramp?.minAccuracy) : DEFAULT_RAMP.minAccuracy,
    },
    mix: s.mix && typeof s.mix === "object" ? s.mix : {},
    loopPasses: LOOP_PASSES.includes(Number(s.loopPasses)) ? Number(s.loopPasses) : 0,
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
  const place = (midi: number, string: number, fret: number) => (own ? { string, fret } : lowestPosition(tuned, midi));
  for (const n of notes) {
    if (n.bar < barFrom || (barTo >= 0 && n.bar > barTo)) continue;
    // Akkord: nicht spielbare Töne entfallen; bleibt nur einer, wird es eine einzelne Note
    const tones = (n.chord ?? [n]).flatMap((c) => {
      const pos = place(c.midi, c.string, c.fret);
      if (!pos) unplayable++;
      return pos ? [{ midi: c.midi, ...pos }] : [];
    });
    if (tones.length === 0) continue;
    const [low] = tones;
    targets.push({ midi: low.midi, flat: n.flat, bar: n.bar, legato: n.legato, string: low.string, fret: low.fret,
                   ...(tones.length > 1 ? { chord: tones } : {}) });
  }
  return { targets, unplayable, ownPositions: own };
}

/** Problemstellen: Takte mit mindestens `minAttempts` Versuchen und unter 90 % Treffern,
    schwächste zuerst (bei gleicher Quote die mit mehr Versuchen). */
export function problemBars(stats: BarStat[], minAttempts = 3, limit = 5): BarStat[] {
  const rate = (b: BarStat) => b.hits / b.attempts;
  return stats
    .filter((b) => b.attempts >= minAttempts && rate(b) < 0.9)
    .sort((a, b) => rate(a) - rate(b) || b.attempts - a.attempts)
    .slice(0, limit);
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
