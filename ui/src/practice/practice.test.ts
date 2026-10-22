import { describe, expect, it } from "vitest";
import { INSTRUMENTS, instrumentById } from "../instruments";
import { CLEFS, clefById, defaultClef, isNatural, ledgerLines, spell, spellNatural, staffStep } from "../music/notation";
import { presetTuning, tunedInstrument, tuningPresets } from "../music/tunings";
import { fingerFor } from "../calibration/Fretboard";
import { DIFFICULTIES, difficultyById, ignoredNote, LevelReference, onPlayedNote, playableRange, startPractice } from "./engine";
import { points } from "./scoring";
import { playMode, toleranceBeats } from "./timing";
import { candidatePitches, clampRange, fullRange, nextTarget, randomSource, seededRandom, type Target } from "./generator";

const note = (midi: number, cents = 0) => ({ midi, cents, timeMs: 0, onsetType: "pick" as const });

describe("Notenschrift", () => {
  it("schreibt Stammtöne mit deutschem H", () => {
    expect(spellNatural(59)).toMatchObject({ name: "H", octave: 3 });
    expect(spellNatural(60)).toMatchObject({ name: "C", octave: 4 });
    expect(isNatural(61)).toBe(false);
  });

  it("setzt Noten an die richtige Stelle des Systems", () => {
    const treble = clefById("treble");
    expect(staffStep(64, treble)).toBe(0); // E4 auf der untersten Linie
    expect(staffStep(77, treble)).toBe(8); // F5 auf der obersten Linie
    expect(staffStep(60, treble)).toBe(-2); // C4 auf der ersten Hilfslinie

    const bass = clefById("bass");
    expect(staffStep(43, bass)).toBe(0); // G2 unterste Linie
    expect(staffStep(57, bass)).toBe(8); // A3 oberste Linie

    expect(staffStep(53, clefById("alto"))).toBe(0); // F3
    expect(staffStep(60, clefById("alto"))).toBe(4); // C4 auf der Mittellinie
    expect(staffStep(60, clefById("tenor"))).toBe(6); // C4 auf der vierten Linie
  });

  it("notiert oktavierende Schlüssel eine Oktave höher als sie klingen", () => {
    // tiefe E-Saite der Gitarre (E2) wird wie E3 notiert: unter der dritten Hilfslinie
    expect(staffStep(40, clefById("treble8vb"))).toBe(-7);
    expect(ledgerLines(-7)).toEqual([-2, -4, -6]);
    // tiefe E-Saite des Basses (E1) im Bassschlüssel 8vb wie E2: unter dem System
    expect(staffStep(28, clefById("bass8vb"))).toBe(-2);
  });

  it("zeichnet Hilfslinien nur außerhalb des Systems", () => {
    expect(ledgerLines(4)).toEqual([]);
    expect(ledgerLines(-2)).toEqual([-2]);
    expect(ledgerLines(-5)).toEqual([-2, -4]);
    expect(ledgerLines(11)).toEqual([10]);
    expect(ledgerLines(12)).toEqual([10, 12]);
  });

  it("wählt übliche Schlüssel je Instrument", () => {
    expect(defaultClef("guitar6")).toBe("treble8vb");
    expect(defaultClef("bass4")).toBe("bass8vb");
    expect(defaultClef("viola")).toBe("alto");
    expect(CLEFS).toHaveLength(6);
  });
});

describe("Stimmungen", () => {
  it("Drop D senkt nur die tiefste Saite", () => {
    const g = instrumentById("guitar6");
    const t = tunedInstrument(g, presetTuning(g, "dropD"));
    expect(t.strings.map((s) => s.midi)).toEqual([38, 45, 50, 55, 59, 64]);
    expect(t.strings[0].name).toBe("D");
    expect(t.minHz).toBeLessThan(g.minHz); // Tonbereich folgt der Stimmung
  });

  it("bietet nur Vorlagen an, die zur Saitenzahl passen", () => {
    expect(tuningPresets(instrumentById("bass5")).map((p) => p.id)).not.toContain("bead");
    expect(tuningPresets(instrumentById("violin")).map((p) => p.id)).toEqual(["standard"]);
  });
});

describe("Zufallsgenerator", () => {
  const bass = instrumentById("bass4");

  it("erzeugt bis Mittel nur Stammtöne im Übungsbereich", () => {
    const pitches = candidatePitches(bass, { strings: [0, 1], frets: [0, 5] }, true);
    for (const midi of pitches.keys()) {
      expect(isNatural(midi)).toBe(true);
      expect(midi).toBeGreaterThanOrEqual(28);
      expect(midi).toBeLessThanOrEqual(38);
    }
    // E1 F1 G1 A1 H1 C2 D2 (D2 = A-Saite 5. Bund)
    expect([...pitches.keys()].sort((a, b) => a - b)).toEqual([28, 29, 31, 33, 35, 36, 38]);
  });

  it("wiederholt keine Note direkt und nutzt alle Töne", () => {
    const pitches = candidatePitches(bass, fullRange(bass, 5), true);
    const random = seededRandom(1);
    const seen = new Set<number>();
    let prev: number | null = null;
    for (let i = 0; i < 400; i++) {
      const t: Target = nextTarget(pitches, prev, random)!;
      expect(t.midi).not.toBe(prev);
      expect(bass.strings[t.string].midi + t.fret).toBe(t.midi);
      seen.add(t.midi);
      prev = t.midi;
    }
    expect(seen.size).toBe(pitches.size);
  });

  it("begrenzt Bereiche auf das Instrument", () => {
    const r = clampRange(bass, { strings: [2, 9], frets: [30, 2] });
    expect(r).toEqual({ strings: [2, 3], frets: [20, 20] });
  });

  it("alle Instrumente liefern Übungsnoten", () => {
    for (const inst of INSTRUMENTS) expect(candidatePitches(inst, fullRange(inst), true).size).toBeGreaterThan(5);
  });
});

describe("Ignorierte Meldungen beim Üben", () => {
  const bass = instrumentById("bass4");
  const playable = playableRange(bass); // E1 (28) bis G2 + 20 Bünde (63)
  const ev = (midi: number, onsetType: "pick" | "legato" = "pick") => ({ midi, cents: 0, timeMs: 0, onsetType });

  it("Legato-Meldungen zählen nur, wenn sie den gesuchten Ton treffen", () => {
    expect(ignoredNote(ev(33, "legato"), 47, playable)).toBe(true); // nachklingende A-Saite
    expect(ignoredNote(ev(47, "legato"), 47, playable)).toBe(false);
  });

  it("unspielbar tiefe oder hohe Töne werden ignoriert, falsche spielbare nicht", () => {
    expect(playable).toEqual([28, 63]);
    expect(ignoredNote(ev(26), 47, playable)).toBe(true); // D1 unter der leeren E-Saite
    expect(ignoredNote(ev(27), 47, playable)).toBe(true); // D♯1: Stimmung ist eingestellt, keine Reserve
    expect(ignoredNote(ev(28), 47, playable)).toBe(false); // leere E-Saite zählt
    expect(ignoredNote(ev(45), 47, playable)).toBe(false); // falscher, aber spielbarer Ton zählt
    expect(ignoredNote(ev(70), 47, playable)).toBe(true);
  });
});

describe("Fingersatz", () => {
  it("ein Finger pro Bund, ab Bund 5 wieder von vorn, leer = 0", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(fingerFor)).toEqual([0, 1, 2, 3, 4, 1, 2, 3, 4, 1, 4]);
  });
});

describe("Warte-Modus", () => {
  const bass = instrumentById("bass4");
  const pitches = candidatePitches(bass, fullRange(bass, 5), true);

  it("rückt nur beim richtigen Ton vor und misst die Reaktionszeit", () => {
    const random = seededRandom(7);
    let s = startPractice(randomSource(pitches, random), 1000);
    const first = s.queue[0];
    expect(s.queue).toHaveLength(4);

    s = onPlayedNote(s, note(first.midi + 1), 25, randomSource(pitches, random), 1500);
    expect(s.queue[0]).toBe(first);
    expect(s.stats).toMatchObject({ hits: 0, misses: 1, streak: 0 });

    s = onPlayedNote(s, note(first.midi, 12), 25, randomSource(pitches, random), 1800);
    expect(s.queue[0]).not.toBe(first);
    expect(s.stats).toMatchObject({ hits: 1, misses: 1, streak: 1, reactionMs: [800] });
    expect(s.last).toMatchObject({ kind: "hit", inTune: true });
  });

  it("ein nachklingender, gerade getroffener Ton zählt nicht als Fehler", () => {
    const random = seededRandom(11);
    let s = startPractice(randomSource(pitches, random), 0);
    const first = s.queue[0];
    s = onPlayedNote(s, note(first.midi), 25, randomSource(pitches, random), 500);
    const second = s.queue[0];
    expect(second.midi).not.toBe(first.midi);

    // derselbe Ton wird nochmal gemeldet (z. B. beim Abdämpfen)
    s = onPlayedNote(s, note(first.midi), 25, randomSource(pitches, random), 600);
    expect(s.stats).toMatchObject({ hits: 1, misses: 0, streak: 1 });
    expect(s.queue[0]).toBe(second);

    // ein anderer falscher Ton zählt weiterhin
    const wrong = [...pitches.keys()].find((m) => m !== first.midi && m !== second.midi)!;
    s = onPlayedNote(s, note(wrong), 25, randomSource(pitches, random), 700);
    expect(s.stats.misses).toBe(1);
  });

  it("falsche Oktave zählt als Fehler und wird erkannt", () => {
    const random = seededRandom(3);
    let s = startPractice(randomSource(pitches, random), 0);
    const t = s.queue[0];
    s = onPlayedNote(s, note(t.midi + 12), 25, randomSource(pitches, random), 100);
    expect(s.last).toMatchObject({ kind: "miss", octaveOff: true });
    expect(s.stats.hits).toBe(0);
  });
});

describe("Vorzeichen (Stufe „Schwer“)", () => {
  it("schreibt Töne mit ♯ oder ♭, B♭ deutsch als B", () => {
    expect(spell(61)).toMatchObject({ letter: 0, accidental: 1, name: "C♯", octave: 4 });
    expect(spell(61, true)).toMatchObject({ letter: 1, accidental: -1, name: "D♭", octave: 4 });
    expect(spell(70, true)).toMatchObject({ letter: 6, accidental: -1, name: "B" });
    expect(spell(70)).toMatchObject({ name: "A♯" });
    expect(spell(60, true)).toMatchObject({ accidental: 0, name: "C" }); // Stammton bleibt
  });

  it("setzt ♯ auf die Stelle des tieferen, ♭ auf die des höheren Stammtons", () => {
    const treble = clefById("treble");
    expect(staffStep(66, treble)).toBe(staffStep(65, treble)); // F♯ wie F
    expect(staffStep(66, treble, true)).toBe(staffStep(67, treble)); // G♭ wie G
  });

  it("übt auf „Schwer“ auch Töne mit Vorzeichen in beiden Schreibweisen", () => {
    const bass = instrumentById("bass4");
    const range = { strings: [0, 3] as [number, number], frets: [0, 5] as [number, number] };
    const all = candidatePitches(bass, range, false);
    expect([...all.keys()].some((m) => !isNatural(m))).toBe(true);
    expect(all.size).toBeGreaterThan(candidatePitches(bass, range, true).size);
    expect(DIFFICULTIES.find((d) => d.id === "hard")?.naturalsOnly).toBe(false);

    const random = seededRandom(7);
    const flats = new Set<boolean | undefined>();
    for (let i = 0; i < 200; i++) {
      const t = nextTarget(all, null, random)!;
      if (isNatural(t.midi)) expect(t.flat).toBeUndefined();
      else flats.add(t.flat);
    }
    expect(flats).toEqual(new Set([true, false]));
  });

  it("ist getaktet mit engerer Toleranz und höherem Stufenfaktor", () => {
    expect(playMode("auto", "hard")).toBe("timed");
    expect(toleranceBeats("hard")).toBe(0.15);
    expect(toleranceBeats("medium")).toBe(0.25);
    expect(points(1, 1, "hard")).toBe(200);
  });
});

describe("Leise Fehlerkennungen", () => {
  // Pegel aus einer Diagnose-Aufnahme (Bass, Gate −48 dBFS)
  const pick = (midi: number, levelDb: number, corrected = false) =>
    ({ midi, cents: 0, timeMs: 0, onsetType: "pick" as const, levelDb, corrected });
  const playable: [number, number] = [28, 63];

  it("bildet den Bezugspegel aus dem Median der letzten Anschläge", () => {
    const ref = new LevelReference();
    ref.add(pick(36, -16));
    ref.add(pick(35, -17));
    expect(ref.value()).toBeUndefined(); // zu wenig Daten: Pegelregel greift noch nicht
    ref.add(pick(40, -20));
    expect(ref.value()).toBe(-17);
    ref.add({ ...pick(41, -60), onsetType: "legato" }); // Legato zählt nicht
    expect(ref.value()).toBe(-17);
  });

  it("wertet viel leisere falsche Töne nicht, echte falsche Anschläge schon", () => {
    expect(ignoredNote(pick(33, -49), 47, playable, -21)).toBe(true); // mitschwingende leere A-Saite
    expect(ignoredNote(pick(38, -25), 28, playable, -20)).toBe(false); // wirklich D-Saite gespielt
    expect(ignoredNote(pick(33, -49), 47, playable, undefined)).toBe(false); // ohne Bezug keine Pegelregel
  });

  it("zählt den Zielton auch leise, außer er entstand erst durch die Korrektur", () => {
    expect(ignoredNote(pick(47, -44), 47, playable, -20)).toBe(false);
    expect(ignoredNote(pick(36, -48, true), 36, playable, -20)).toBe(true);
  });
});

describe("Stufe „Sehr schwer“: Hammer-on/Pull-off", () => {
  const bass = instrumentById("bass4");
  const range = { strings: [0, 3] as [number, number], frets: [0, 7] as [number, number] };
  const pitches = candidatePitches(bass, range, false);

  it("bindet ab und zu eine Note auf derselben Saite an (1–4 Bünde, nie zweimal hintereinander)", () => {
    const random = seededRandom(3);
    const source = randomSource(pitches, random, 0.5);
    let prev: Target | null = null;
    let legatos = 0;
    for (let i = 0; i < 300; i++) {
      const t: Target = source(prev)!;
      if (t.legato) {
        legatos++;
        expect(prev).not.toBeNull();
        expect(prev!.legato).toBeFalsy();
        expect(t.string).toBe(prev!.string);
        expect(Math.abs(t.fret - prev!.fret)).toBeGreaterThanOrEqual(1);
        expect(Math.abs(t.fret - prev!.fret)).toBeLessThanOrEqual(4);
        expect(t.midi - prev!.midi).toBe(t.fret - prev!.fret);
      }
      prev = t;
    }
    expect(legatos).toBeGreaterThan(40);
    expect(randomSource(pitches, seededRandom(3))(null)?.legato).toBeFalsy(); // ohne Chance keine Bindungen
  });

  it("wertet angeschlagene statt gebundene Noten mit halben Punkten, getaktet mit engem Fenster", () => {
    const t: Target = { midi: 35, string: 1, fret: 2, legato: true };
    const s0 = { ...startPractice(() => null, 0), queue: [t] };
    const legatoHit = onPlayedNote(s0, { ...note(35), onsetType: "legato" }, 25, () => null, 400, "veryHard");
    const pickedHit = onPlayedNote(s0, note(35), 25, () => null, 400, "veryHard");
    expect(legatoHit.last).toMatchObject({ kind: "hit", picked: false });
    expect(pickedHit.last).toMatchObject({ kind: "hit", picked: true });
    expect(pickedHit.stats.score * 2).toBe(legatoHit.stats.score);
    expect(toleranceBeats("veryHard")).toBe(0.1);
    expect(playMode("auto", "veryHard")).toBe("timed");
    expect(difficultyById("veryHard")).toMatchObject({ id: "veryHard", legato: true, naturalsOnly: false });
  });
});
