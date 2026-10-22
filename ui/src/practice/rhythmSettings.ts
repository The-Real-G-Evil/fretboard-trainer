// Einstellungen der Rhythmus-Übung (Spielmodus „Rhythmus“), dauerhaft im Kern gespeichert.

import { api } from "../api";
import { RHYTHM_LEVELS, type RhythmLevel } from "../song/rhythm";
import { clampTempo, LOOP_PASSES, songOf, type SongSettings, type TempoRamp } from "../song/songPractice";
import type { UiSettings } from "./settings";

export interface RhythmSettings {
  level: RhythmLevel;
  bars: number;
  tempoPercent: number; // Anteil am eingestellten BPM (wie beim Lied)
  ramp: TempoRamp;
  loop: boolean;
  loopPasses: number;
  metronome: boolean;
}

export const RHYTHM_BARS = [4, 8, 16];

export function rhythmOf(ui: UiSettings): RhythmSettings {
  const s = (ui["practice.rhythm"] ?? {}) as Partial<RhythmSettings>;
  const song = songOf({ "practice.song": { ramp: s.ramp } }); // gleiche Prüfung der Tempo-Steigerung
  return {
    level: RHYTHM_LEVELS.some((l) => l.id === s.level) ? s.level! : "simple",
    bars: RHYTHM_BARS.includes(Number(s.bars)) ? Number(s.bars) : 8,
    tempoPercent: s.tempoPercent !== undefined ? clampTempo(Number(s.tempoPercent) || 100) : 100,
    ramp: song.ramp,
    loop: s.loop ?? true,
    loopPasses: LOOP_PASSES.includes(Number(s.loopPasses)) ? Number(s.loopPasses) : 0,
    metronome: s.metronome ?? true,
  };
}

export function saveRhythm(ui: UiSettings, r: RhythmSettings): UiSettings {
  api.setUiSetting("practice.rhythm", r);
  return { ...ui, "practice.rhythm": r };
}

/** Die Übung als Lied für den Song-Modus. */
export const rhythmSongSettings = (base: SongSettings, r: RhythmSettings, path: string, name: string): SongSettings => ({
  ...base, path, name, track: 0, barFrom: 0, barTo: -1, loop: r.loop, loopPasses: r.loopPasses, songTempo: true,
  tempoPercent: r.tempoPercent, metronome: r.metronome, ramp: r.ramp, mix: {}, recent: [],
});

/** Änderungen im Song-Modus (Tempo, Steigerung, Wiederholen, Metronom) in die Rhythmus-Einstellungen übernehmen. */
export const fromSongSettings = (r: RhythmSettings, s: SongSettings): RhythmSettings => ({
  ...r, tempoPercent: s.tempoPercent, ramp: s.ramp, loop: s.loop, loopPasses: s.loopPasses, metronome: s.metronome,
});
