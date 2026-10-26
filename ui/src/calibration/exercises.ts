// Kalibrier-Übungen: kurze Vorgaben, die der Nutzer nachspielt, während die App aufnimmt.
// Die Stufen bauen aufeinander auf; höhere Stufen prüfen schwierigere Fälle der Erkennung.

import type { Instrument } from "../instruments";
import { t, tKey } from "../i18n";

export type OnsetKind = "pick" | "legato";

export interface ExerciseNote {
  midi: number;
  type: OnsetKind;
  string: number; // Index in instrument.strings (0 = tiefste)
  fret: number; // Bund bzw. Halbtöne über der Leersaite
}

export interface Exercise {
  id: string;
  level: number;
  title: string;
  instructions: string;
  kind: "notes" | "silence";
  notes: ExerciseNote[];
  durationSec?: number; // nur für "silence"
}

export const LEVEL_NAMES: Record<number, string> = {
  0: tKey("Grundrauschen"),
  1: tKey("Einzeltöne"),
  2: tKey("Lagen & Oktaven"),
  3: "Legato",
  4: tKey("Tempo & Wiederholungen"),
};

const note = (inst: Instrument, string: number, fret: number, type: OnsetKind = "pick"): ExerciseNote => ({
  midi: inst.strings[string].midi + fret,
  type,
  string,
  fret,
});

/** Mittlere Saiten (für Übungen, die nicht alle Saiten brauchen). */
function middleStrings(inst: Instrument, count: number) {
  const n = inst.strings.length;
  const start = Math.max(0, Math.floor((n - count) / 2));
  return Array.from({ length: Math.min(count, n) }, (_, i) => start + i);
}

export function exercisesFor(inst: Instrument): Exercise[] {
  const all = inst.strings.map((_, i) => i);
  const mid = middleStrings(inst, 3);
  const top = [inst.strings.length - 2, inst.strings.length - 1].filter((i) => i >= 0);
  const octave = Math.min(12, inst.frets);
  const bow = inst.fretted ? t("anschlagen") : t("neu ansetzen (Bogenwechsel)");
  const slur = inst.fretted ? t("Hammer-on/Pull-off – nicht neu anschlagen") : t("gebunden, ohne Bogenwechsel");

  return [
    {
      id: "silence",
      level: 0,
      kind: "silence",
      title: t("Ruhe messen"),
      instructions: t("Instrument angeschlossen lassen, alle Saiten abdämpfen und nichts spielen. Misst das Grundrauschen für die Gate-Schwelle."),
      durationSec: 4,
      notes: [],
    },
    {
      id: "open-strings",
      level: 1,
      kind: "notes",
      title: t("Leersaiten"),
      instructions: t("Jede Leersaite einzeln {bow}, ausklingen lassen – erst aufwärts, dann abwärts.", { bow }),
      notes: [...all, ...[...all].reverse()].map((s) => note(inst, s, 0)),
    },
    {
      id: "first-position",
      level: 1,
      kind: "notes",
      title: t("Erste Lage"),
      instructions: t("Auf jeder Saite Bund 0, 2 und 4 nacheinander, jeden Ton einzeln {bow}.", { bow }),
      notes: all.flatMap((s) => [0, 2, 4].map((f) => note(inst, s, f))),
    },
    {
      id: "octaves",
      level: 2,
      kind: "notes",
      title: t("Oktaven"),
      instructions: t("Auf jeder Saite die Leersaite und dann Bund {fret} (Oktave). Prüft, dass die Oktave stimmt.", { fret: octave }),
      notes: all.flatMap((s) => [note(inst, s, 0), note(inst, s, octave)]),
    },
    {
      id: "position-shifts",
      level: 2,
      kind: "notes",
      title: t("Lagenwechsel"),
      instructions: t("Große Sprünge zwischen tiefen und hohen Lagen, jeden Ton einzeln anschlagen."),
      notes: [
        note(inst, 0, 3), note(inst, all.length - 1, Math.min(10, inst.frets)),
        note(inst, 1 % all.length, 5), note(inst, all.length - 1, 1),
        note(inst, 0, Math.min(7, inst.frets)), note(inst, mid[0], Math.min(9, inst.frets)),
        note(inst, all.length - 1, Math.min(15, inst.frets)), note(inst, 0, 0),
      ],
    },
    {
      id: "hammer-pull",
      level: 3,
      kind: "notes",
      title: "Hammer-on & Pull-off",
      instructions: t("Pro Saite nur den ersten Ton {bow}, die übrigen {slur}: 0 – 2 – 4 – 2 – 0.", { bow, slur }),
      notes: mid.flatMap((s) => [
        note(inst, s, 0), note(inst, s, 2, "legato"), note(inst, s, 4, "legato"),
        note(inst, s, 2, "legato"), note(inst, s, 0, "legato"),
      ]),
    },
    {
      id: "slurs-high",
      level: 3,
      kind: "notes",
      title: t("Legato in hoher Lage"),
      instructions: t("Ab Bund 5: erster Ton {bow}, dann {slur}. Danach jeden Ton einzeln anschlagen.", { bow, slur }),
      notes: top.flatMap((s) => [
        note(inst, s, 5), note(inst, s, 7, "legato"), note(inst, s, 8, "legato"), note(inst, s, 7, "legato"),
        note(inst, s, 5, "legato"), note(inst, s, 8), note(inst, s, 7), note(inst, s, 5),
      ]),
    },
    {
      id: "repeats",
      level: 4,
      kind: "notes",
      title: t("Tonwiederholungen"),
      instructions: t("Jeden Ton viermal zügig und gleichmäßig anschlagen (etwa Achtel bei 100 BPM)."),
      notes: mid.flatMap((s) => Array.from({ length: 4 }, () => note(inst, s, 5))),
    },
    {
      id: "fast-mixed",
      level: 4,
      kind: "notes",
      title: t("Schnelle Phrase"),
      instructions: t("Zügig und fließend spielen; Legato-Töne gebunden, die anderen anschlagen."),
      notes: [
        ...mid.slice(-2).flatMap((s) => [
          note(inst, s, 5), note(inst, s, 7, "legato"), note(inst, s, 5, "legato"),
          note(inst, s, 8), note(inst, s, 7), note(inst, s, 5),
        ]),
        note(inst, all.length - 1, 5), note(inst, all.length - 1, 7, "legato"), note(inst, all.length - 1, 8, "legato"),
      ],
    },
  ];
}
