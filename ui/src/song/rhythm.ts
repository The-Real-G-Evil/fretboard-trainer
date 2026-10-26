// Rhythmus-Übung (Spielmodus „Rhythmus“): Töne aus der Notenquelle (Zufall, Tonleiter) mit
// echten Notenlängen und Pausen als Lied. Abgespielt und bewertet wird sie wie ein Lied im Song-Modus.

import type { Instrument } from "../instruments";
import type { Random, Target, TargetSource } from "../practice/generator";
import { t, tKey } from "../i18n";

export type RhythmLevel = "simple" | "medium" | "hard";

export const RHYTHM_LEVELS: { id: RhythmLevel; name: string; hint: string }[] = [
  { id: "simple", name: tKey("einfach"), hint: tKey("Ganze, Halbe, Viertel") },
  { id: "medium", name: tKey("mittel"), hint: tKey("dazu Achtel, punktierte Halbe, Pausen") },
  { id: "hard", name: tKey("schwer"), hint: tKey("dazu Sechzehntel, Punktierungen, Synkopen") },
];

/** Ein Ereignis im Takt: Notenwert (1 = Ganze … 16 = Sechzehntel), punktiert, Pause. */
export interface RhythmEvent {
  value: 1 | 2 | 4 | 8 | 16;
  dotted?: boolean;
  rest?: boolean;
}

/** Länge in Vierteln. */
export const quarters = (e: RhythmEvent) => (4 / e.value) * (e.dotted ? 1.5 : 1);

type Cell = { len: number; weight: number; events: RhythmEvent[] };

const n = (value: RhythmEvent["value"], dotted = false): RhythmEvent => ({ value, ...(dotted ? { dotted } : {}) });
const r = (value: RhythmEvent["value"]): RhythmEvent => ({ value, rest: true });

// Bausteine je Stufe (jede Stufe enthält die einfacheren)
const CELLS: Record<RhythmLevel, Cell[]> = {
  simple: [
    { len: 4, weight: 0.5, events: [n(1)] },
    { len: 2, weight: 3, events: [n(2)] },
    { len: 1, weight: 6, events: [n(4)] },
  ],
  medium: [
    { len: 3, weight: 1, events: [n(2, true)] },
    { len: 1, weight: 4, events: [n(8), n(8)] },
    { len: 1, weight: 1.5, events: [r(4)] },
    { len: 1, weight: 1, events: [r(8), n(8)] },
  ],
  hard: [
    { len: 2, weight: 2, events: [n(4, true), n(8)] },
    { len: 2, weight: 1.5, events: [n(8), n(4), n(8)] },
    { len: 1, weight: 2, events: [n(16), n(16), n(16), n(16)] },
    { len: 1, weight: 2, events: [n(8), n(16), n(16)] },
    { len: 1, weight: 2, events: [n(16), n(16), n(8)] },
    { len: 1, weight: 1, events: [r(16), n(16), n(8)] },
  ],
};

const cellsFor = (level: RhythmLevel) =>
  level === "simple" ? CELLS.simple : level === "medium" ? [...CELLS.simple, ...CELLS.medium]
    : [...CELLS.simple, ...CELLS.medium, ...CELLS.hard];

/** Ein 4/4-Takt aus Bausteinen; zweischlägige beginnen auf Schlag 1 oder 3 (übersichtliche Balken). */
export function rhythmBar(level: RhythmLevel, random: () => number): RhythmEvent[] {
  const cells = cellsFor(level);
  const out: RhythmEvent[] = [];
  let pos = 0;
  while (pos < 4) {
    const fits = cells.filter((c) => c.len <= 4 - pos && (c.len !== 2 || pos % 2 === 0) && (c.len !== 4 || pos === 0)
                                     && (c.len !== 3 || pos <= 1));
    const total = fits.reduce((a, c) => a + c.weight, 0);
    let x = random() * total;
    let cell = fits[fits.length - 1];
    for (const c of fits) {
      x -= c.weight;
      if (x < 0) {
        cell = c;
        break;
      }
    }
    out.push(...cell.events);
    pos += cell.len;
  }
  return out;
}

export interface RhythmOptions {
  bars: number;
  level: RhythmLevel;
  bpm: number;
  title?: string;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchName = (midi: number) => `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const gmProgram = (inst: Instrument) =>
  inst.id.startsWith("bass") ? 33 : inst.id === "violin" ? 40 : inst.id === "viola" ? 41 : inst.id === "cello" ? 42 : 25;

/** Übung als alphaTex: Takte mit Rhythmus, Töne aus der Quelle (Griffstellen wie vorgeschlagen). Ist die
    Quelle zu Ende (Tonfolge ohne Wiederholen), folgen Pausen. Gebundene Töne werden nur übernommen,
    wenn die Note davor auf derselben Saite klingt. */
export function rhythmExercise(inst: Instrument, source: TargetSource, random: Random, opt: RhythmOptions): { tex: string; notes: number } {
  const strings = inst.strings.length;
  const bars: string[] = [];
  let prev: Target | null = null;
  let prevWasNote = false;
  let count = 0;
  const pending: { text: string; target: Target | null }[][] = [];

  for (let b = 0; b < opt.bars; b++) {
    const beats: { text: string; target: Target | null }[] = [];
    for (const e of rhythmBar(opt.level, random)) {
      const dot = e.dotted ? " {d}" : "";
      const t: Target | null = e.rest ? null : source(prev);
      if (!t) {
        beats.push({ text: `r.${e.value}${dot}`, target: null });
        prevWasNote = false;
        continue;
      }
      // Hammer-on/Pull-off: Bogen an der vorigen Note (gleiche Saite, direkt davor)
      const slurred: boolean = !!t.legato && prevWasNote && (prev as Target | null)?.string === t.string;
      if (slurred) {
        const last = beats.length ? beats[beats.length - 1] : pending[pending.length - 1]?.[pending[pending.length - 1].length - 1];
        if (last?.target) last.text = last.text.replace(/^(\d+\.\d+)/, "$1{h}");
      }
      beats.push({ text: `${t.fret}.${strings - t.string}.${e.value}${dot}`, target: t });
      prev = slurred ? t : { ...t, legato: false };
      prevWasNote = true;
      count++;
    }
    pending.push(beats);
  }
  for (const beats of pending) bars.push(beats.map((x) => x.text).join(" "));

  const tuning = [...inst.strings].reverse().map((s) => pitchName(s.midi)).join(" ");
  const tex = [
    `\\title "${opt.title ?? t("Rhythmus-Übung")}"`,
    `\\tempo ${Math.round(opt.bpm)}`,
    ".",
    `\\track "${t("Übung")}"`,
    `\\tuning (${tuning})`,
    `\\instrument ${gmProgram(inst)}`,
    bars.join(" | ") + " |",
  ].join("\n");
  return { tex, notes: count };
}
