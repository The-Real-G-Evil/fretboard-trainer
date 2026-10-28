// Aufnahme -> Noten: gespielte Töne auf ein Raster legen (am Metronom oder mit geschätztem Tempo)
// und als alphaTex ausgeben; daraus wird die Guitar-Pro-Datei.
import type { Instrument } from "../instruments";
import { lowestPosition } from "../song/songPractice";

export interface PlayedNote {
  midi: number;
  startMs: number; // Stream-Uhr
  endMs?: number; // Ende laut Erkennung (fehlt: bis zur nächsten Note)
  legato: boolean; // Hammer-on/Pull-off
}

export interface HeardBeat {
  timeMs: number; // wann der Klick zu hören war (Stream-Uhr, Latenz schon eingerechnet)
  accent: boolean; // erster Schlag im Takt
}

/** Raster: Schritte je Viertel (2 = Achtel, 4 = Sechzehntel). */
export type Steps = 2 | 4;

export interface ScoreOptions {
  beatsPerBar: number;
  steps: Steps;
  title: string;
  track: string;
}

/** Note auf dem Raster: Beginn und Länge in Schritten ab Taktanfang 1. */
export interface GridNote {
  midi: number;
  pos: number;
  len: number;
  legato: boolean;
}

/** Zeit -> Rasterposition (Schritte, nicht gerundet). */
type Timeline = (ms: number) => number;

/** Tempo aus den Anschlägen schätzen: das Tempo, dessen Achtelraster die Anschläge am besten trifft
    (bei Gleichstand das näher an 110 BPM, damit Verdopplungen nicht gewinnen). */
export function estimateTempo(startsMs: number[], minBpm = 60, maxBpm = 180): number {
  if (startsMs.length < 3) return 100;
  const t0 = startsMs[0];
  let best = { bpm: 100, err: Infinity };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const eighth = 30000 / bpm;
    let err = 0;
    for (const t of startsMs) {
      const d = (t - t0) / eighth;
      err += (d - Math.round(d)) ** 2;
    }
    err /= startsMs.length;
    const better = err < best.err - 1e-4 || (Math.abs(err - best.err) <= 1e-4 && Math.abs(bpm - 110) < Math.abs(best.bpm - 110));
    if (better) best = { bpm, err };
  }
  return best.bpm;
}

/** Zeitachse an den gehörten Metronomschlägen: zwischen zwei Schlägen linear, davor und danach mit
    dem mittleren Schlagabstand. Takt 1 beginnt mit dem letzten betonten Schlag vor der ersten Note. */
export function beatTimeline(beats: HeardBeat[], firstNoteMs: number, steps: Steps): Timeline | null {
  if (beats.length < 2) return null;
  const period = (beats[beats.length - 1].timeMs - beats[0].timeMs) / (beats.length - 1);
  const halfStep = period / steps / 2;
  let bar0 = beats.findIndex((b) => b.accent);
  for (let i = 0; i < beats.length; i++)
    if (beats[i].accent && beats[i].timeMs <= firstNoteMs + halfStep) bar0 = i;
  if (bar0 < 0) bar0 = 0;

  return (ms) => {
    let i = beats.findIndex((b) => b.timeMs > ms) - 1;
    if (i < 0) i = ms < beats[0].timeMs ? -1 : beats.length - 1;
    const base = i < 0 ? beats[0] : beats[i];
    const next = i >= 0 && i + 1 < beats.length ? beats[i + 1] : null;
    const span = next ? next.timeMs - base.timeMs : period;
    const beatPos = (i < 0 ? 0 : i) + (ms - base.timeMs) / span;
    return (beatPos - bar0) * steps;
  };
}

/** Zeitachse für frei Gespieltes: geschätztes Tempo, Takt 1 beginnt mit der ersten Note. */
export function freeTimeline(firstNoteMs: number, bpm: number, steps: Steps): Timeline {
  const step = 60000 / bpm / steps;
  return (ms) => (ms - firstNoteMs) / step;
}

/** Töne aufs Raster legen. Zwei Töne auf demselben Schritt: der spätere entfällt (Doppelanschlag);
    eine Note endet spätestens mit der nächsten und dauert mindestens einen Schritt. */
export function quantize(notes: PlayedNote[], timeline: Timeline): GridNote[] {
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs);
  const placed: (PlayedNote & { pos: number })[] = [];
  for (const n of sorted) {
    const pos = Math.round(timeline(n.startMs));
    if (pos < 0 || (placed.length && placed[placed.length - 1].pos === pos)) continue;
    placed.push({ ...n, pos });
  }
  return placed.map((n, i) => {
    const next = placed[i + 1]?.pos ?? Infinity;
    const end = n.endMs !== undefined ? Math.round(timeline(n.endMs)) : next;
    const len = Math.max(1, Math.min(end, next) - n.pos);
    return { midi: n.midi, pos: n.pos, len: Number.isFinite(len) ? len : 1, legato: n.legato };
  });
}

// Notenwerte in Sechzehnteln: Ganze, punktierte Halbe, Halbe, punktierte Viertel, Viertel, …
const VALUES: { len: number; value: number; dotted: boolean }[] = [
  { len: 16, value: 1, dotted: false }, { len: 12, value: 2, dotted: true }, { len: 8, value: 2, dotted: false },
  { len: 6, value: 4, dotted: true }, { len: 4, value: 4, dotted: false }, { len: 3, value: 8, dotted: true },
  { len: 2, value: 8, dotted: false }, { len: 1, value: 16, dotted: false },
];

/** Länge (Sechzehntel) in darstellbare Notenwerte zerlegen, größte zuerst. */
export function splitDuration(sixteenths: number): { value: number; dotted: boolean }[] {
  const out: { value: number; dotted: boolean }[] = [];
  let rest = sixteenths;
  while (rest > 0) {
    const v = VALUES.find((x) => x.len <= rest)!;
    out.push({ value: v.value, dotted: v.dotted });
    rest -= v.len;
  }
  return out;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchName = (midi: number) => `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const gmProgram = (inst: Instrument) =>
  inst.id.startsWith("bass") ? 33 : inst.id === "violin" ? 40 : inst.id === "viola" ? 41 : inst.id === "cello" ? 42 : 25;
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

/** Raster-Noten als alphaTex: Griffstellen möglichst tief (Hammer-on auf derselben Saite wie davor),
    lange Noten über Taktstriche gebunden, Lücken als Pausen. Töne außerhalb des Instruments werden Pausen. */
export function toAlphaTex(notes: GridNote[], inst: Instrument, bpm: number, opt: ScoreOptions): string {
  const strings = inst.strings.length;
  const unit = 4 / opt.steps; // Sechzehntel je Schritt
  const barSteps = opt.beatsPerBar * opt.steps;
  const total = notes.length ? notes[notes.length - 1].pos + notes[notes.length - 1].len : barSteps;
  const barCount = Math.max(1, Math.ceil(total / barSteps));
  const bars: string[][] = Array.from({ length: barCount }, () => []);

  // Abschnitt [from, to) in die Takte eintragen; text(i, value, dotted) liefert den Beat (i = Teilstück)
  const emit = (from: number, to: number, text: (i: number, value: number, dotted: boolean) => string) => {
    let piece = 0;
    for (let pos = from; pos < to; ) {
      const bar = Math.floor(pos / barSteps);
      const end = Math.min(to, (bar + 1) * barSteps);
      for (const d of splitDuration((end - pos) * unit)) bars[bar].push(text(piece++, d.value, d.dotted));
      pos = end;
    }
  };
  const rest = (from: number, to: number) => emit(from, to, (_, v, d) => `r.${v}${d ? " {d}" : ""}`);

  let cursor = 0;
  let prevString = -1;
  let prevBeat: { bar: number; index: number } | null = null;
  for (const n of notes) {
    if (n.pos > cursor) {
      rest(cursor, n.pos);
      prevBeat = null; // nach einer Pause kein Bogen
    }
    const sameString = prevString >= 0 ? n.midi - inst.strings[prevString].midi : -1;
    const keep = n.legato && prevBeat && sameString >= 0 && sameString <= inst.frets;
    const at = keep ? { string: prevString, fret: sameString } : lowestPosition(inst, n.midi);
    if (!at) {
      rest(n.pos, n.pos + n.len);
      prevString = -1;
      prevBeat = null;
    } else {
      if (keep && prevBeat) { // Bogen an der letzten Teilnote davor
        const b = bars[prevBeat.bar];
        b[prevBeat.index] = b[prevBeat.index].replace(/^([-\d]+\.\d+)/, "$1{h}");
      }
      const str = strings - at.string;
      emit(n.pos, n.pos + n.len, (i, v, d) => `${i === 0 ? at.fret : "-"}.${str}.${v}${d ? " {d}" : ""}`);
      const lastBar = Math.floor((n.pos + n.len - 1) / barSteps);
      prevBeat = { bar: lastBar, index: bars[lastBar].length - 1 };
      prevString = at.string;
    }
    cursor = n.pos + n.len;
  }
  if (cursor < barCount * barSteps) rest(cursor, barCount * barSteps);

  const tuning = [...inst.strings].reverse().map((s) => pitchName(s.midi)).join(" ");
  const body = bars.map((b) => b.join(" ")).join(" | ") + " |";
  return [
    `\\title ${quote(opt.title)}`,
    `\\tempo ${Math.round(bpm)}`,
    ".",
    `\\track ${quote(opt.track)}`,
    `\\tuning (${tuning})`,
    `\\instrument ${gmProgram(inst)}`,
    `${opt.beatsPerBar !== 4 ? `\\ts ${opt.beatsPerBar} 4 ` : ""}${body}`,
  ].join("\n");
}
