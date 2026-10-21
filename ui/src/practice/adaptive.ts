// Adaptive Auswahl (SPEC Abschnitt 5): Töne mit vielen Fehlern, langsamer Reaktion oder
// ungenauem Timing kommen öfter dran; noch unbekannte Töne anfangs auch.

import type { NoteStatRow } from "../api";
import type { PlayMode } from "./timing";

export interface PitchStat {
  attempts: number;
  hits: number;
  avgReactionMs: number;
  avgTimingAbsMs: number;
  lastPracticed: string;
}

/** Statistik je Ton (über alle Griffpositionen zusammengefasst). */
export function statsByPitch(rows: NoteStatRow[]): Map<number, PitchStat> {
  const map = new Map<number, PitchStat>();
  for (const r of rows) {
    const s = map.get(r.midi) ?? { attempts: 0, hits: 0, avgReactionMs: 0, avgTimingAbsMs: 0, lastPracticed: "" };
    const hits = s.hits + r.hits;
    // nach Treffern gewichtete Mittelwerte
    s.avgReactionMs = hits > 0 ? (s.avgReactionMs * s.hits + r.avgReactionMs * r.hits) / hits : 0;
    s.avgTimingAbsMs = hits > 0 ? (s.avgTimingAbsMs * s.hits + r.avgTimingAbsMs * r.hits) / hits : 0;
    s.attempts += r.attempts;
    s.hits = hits;
    if (r.lastPracticed > s.lastPracticed) s.lastPracticed = r.lastPracticed;
    map.set(r.midi, s);
  }
  return map;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Gewicht eines Tons: 0,5 (sicher) … ca. 7 (oft falsch, langsam, lange nicht geübt). */
export function weightFor(stat: PitchStat | undefined, mode: PlayMode, now = Date.now()): number {
  if (!stat || stat.attempts === 0) return 2; // neu: anfangs öfter, bis es Daten gibt
  const errorRate = 1 - (stat.hits + 1) / (stat.attempts + 2); // geglättet
  const slow =
    stat.hits === 0 ? 1
    : mode === "wait" ? clamp01((stat.avgReactionMs - 1200) / 2500)
    : clamp01(stat.avgTimingAbsMs / 120);
  const few = stat.attempts < 5 ? 0.5 : 0;
  const daysAgo = stat.lastPracticed ? (now - Date.parse(stat.lastPracticed)) / 86_400_000 : 0;
  const stale = daysAgo > 1 ? Math.min(1, daysAgo / 7) : 0; // Wiederholung nach Pause
  return 0.5 + 4 * errorRate + 1.5 * slow + few + stale;
}

export function adaptiveWeights(midis: Iterable<number>, rows: NoteStatRow[], mode: PlayMode, now = Date.now()) {
  const stats = statsByPitch(rows);
  const weights = new Map<number, number>();
  for (const m of midis) weights.set(m, weightFor(stats.get(m), mode, now));
  return weights;
}
