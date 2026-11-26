// Kalibrier-Übung als Noten (alphaTex): feste Notenwerte im 4/4-Takt, damit ein wandernder Strich vorgibt,
// wann ein Ton kommt und wie lange er klingt.

import type { Instrument } from "../instruments";
import { gmProgram, pitchName } from "../song/rhythm";
import type { Exercise } from "./exercises";

export interface CalibrationScore {
  tex: string;
  bpm: number;
  bars: number;
  /** Dauer aller Takte in ms (ohne Vorzähler). */
  durationMs: number;
}

export function calibrationScore(ex: Exercise, inst: Instrument): CalibrationScore | null {
  if (ex.kind !== "notes" || !ex.rhythm || ex.notes.length === 0) return null;
  const { bpm, value } = ex.rhythm;
  const perBar = value; // Notenwert v: v Töne füllen einen 4/4-Takt
  const strings = inst.strings.length;
  const beats = ex.notes.map((n, i) => {
    // Hammer-on/Pull-off: Bogen an der vorigen Note derselben Saite
    const next = ex.notes[i + 1];
    const slur = next?.type === "legato" && next.string === n.string ? "{h}" : "";
    return `${n.fret}.${strings - n.string}${slur}`;
  });
  while (beats.length % perBar !== 0) beats.push("r");
  const bars: string[] = [];
  for (let i = 0; i < beats.length; i += perBar) bars.push(`:${value} ${beats.slice(i, i + perBar).join(" ")}`);
  const tuning = [...inst.strings].reverse().map((s) => pitchName(s.midi)).join(" ");
  const tex = [
    `\\tempo ${bpm}`,
    ".",
    `\\track "${ex.title.replace(/"/g, "'")}"`,
    `\\tuning (${tuning})`,
    `\\instrument ${gmProgram(inst)}`,
    bars.join(" | ") + " |",
  ].join("\n");
  return { tex, bpm, bars: bars.length, durationMs: (bars.length * 4 * 60000) / bpm };
}
