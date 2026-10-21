// Instrument-Vorlagen (Phase 3 erweitert das um eigene Instrumente und Stimmungen).

export interface InstrumentString {
  name: string; // Tonname der Leersaite, z. B. "E"
  midi: number; // Leersaite
}

export interface Instrument {
  id: string;
  name: string;
  strings: InstrumentString[]; // tiefste zuerst
  fretted: boolean;
  frets: number; // bei bundlosen Instrumenten: spielbarer Umfang in Halbtönen
  minHz: number; // Standard-Tonbereich für die Erkennung (aus Stimmung und Bundzahl berechnet)
  maxHz: number;
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Standard-Tonbereich: knapp vier Halbtöne Reserve unter der tiefsten Leersaite (Herunterstimmen),
    oben der höchste Bund der höchsten Saite plus Reserve für Bendings und Flageoletts. */
export function withRange(i: Omit<Instrument, "minHz" | "maxHz">): Instrument {
  const lowest = Math.min(...i.strings.map((s) => s.midi));
  const highest = Math.max(...i.strings.map((s) => s.midi));
  return {
    ...i,
    minHz: Math.floor(midiToHz(lowest) * 0.8),
    maxHz: Math.ceil((midiToHz(highest + i.frets) * 1.25) / 10) * 10,
  };
}

const s = (name: string, midi: number): InstrumentString => ({ name, midi });

export const INSTRUMENTS: Instrument[] = ([
  { id: "guitar6", name: "Gitarre (6)", fretted: true, frets: 22,
    strings: [s("E", 40), s("A", 45), s("D", 50), s("G", 55), s("H", 59), s("E", 64)] },
  { id: "guitar7", name: "Gitarre (7)", fretted: true, frets: 24,
    strings: [s("H", 35), s("E", 40), s("A", 45), s("D", 50), s("G", 55), s("H", 59), s("E", 64)] },
  { id: "guitar8", name: "Gitarre (8)", fretted: true, frets: 24,
    strings: [s("F♯", 30), s("H", 35), s("E", 40), s("A", 45), s("D", 50), s("G", 55), s("H", 59), s("E", 64)] },
  { id: "bass4", name: "Bass (4)", fretted: true, frets: 20,
    strings: [s("E", 28), s("A", 33), s("D", 38), s("G", 43)] },
  { id: "bass5", name: "Bass (5)", fretted: true, frets: 24,
    strings: [s("H", 23), s("E", 28), s("A", 33), s("D", 38), s("G", 43)] },
  { id: "bass6", name: "Bass (6)", fretted: true, frets: 24,
    strings: [s("H", 23), s("E", 28), s("A", 33), s("D", 38), s("G", 43), s("C", 48)] },
  { id: "ukulele", name: "Ukulele", fretted: true, frets: 15,
    strings: [s("G", 67), s("C", 60), s("E", 64), s("A", 69)] },
  { id: "violin", name: "Violine", fretted: false, frets: 24,
    strings: [s("G", 55), s("D", 62), s("A", 69), s("E", 76)] },
  { id: "viola", name: "Viola", fretted: false, frets: 24,
    strings: [s("C", 48), s("G", 55), s("D", 62), s("A", 69)] },
  { id: "cello", name: "Cello", fretted: false, frets: 24,
    strings: [s("C", 36), s("G", 43), s("D", 50), s("A", 57)] },
] satisfies Omit<Instrument, "minHz" | "maxHz">[]).map(withRange);

export const instrumentById = (id: string) => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];

/** Instrument, das um `semitones` versetzt klingt (z. B. -12: Bass statt Gitarre). Gesucht wird
    eines, dessen tiefste Saite genau dort liegt; bei mehreren das mit der ähnlichsten Saitenzahl. */
export function instrumentShiftedBy(inst: Instrument, semitones: number): Instrument | undefined {
  const lowest = inst.strings[0].midi + semitones;
  return INSTRUMENTS.filter((i) => i.id !== inst.id && i.strings[0].midi === lowest).sort(
    (a, b) => Math.abs(a.strings.length - inst.strings.length) - Math.abs(b.strings.length - inst.strings.length),
  )[0];
}

/** Häufigster Oktav-Versatz (±12/±24) zwischen erwarteten und erkannten Tönen, falls er
    bei mindestens `minCount` Tönen auftritt – Hinweis auf ein falsch gewähltes Instrument. */
export function dominantOctaveOffset(pairs: { expected: number; detected: number }[], minCount = 2): number | null {
  const counts = new Map<number, number>();
  for (const p of pairs) {
    const d = p.detected - p.expected;
    if (d !== 0 && d % 12 === 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= minCount ? best[0] : null;
}

/** Saitennummer nach üblicher Zählung: 1 = höchste Saite. */
export const stringNumber = (inst: Instrument, index: number) => inst.strings.length - index;
