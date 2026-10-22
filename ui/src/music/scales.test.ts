import { describe, expect, it } from "vitest";
import { instrumentById } from "../instruments";
import { candidatePitches, seededRandom } from "../practice/generator";
import {
  fingerSequence, scaleById, scaleLabel, scaleNoteNames, scalePitches, scalePositions, scaleRandomSource, scaleTargets,
} from "./scales";

const guitar = instrumentById("guitar6");

describe("Tonleitern", () => {
  it("kennt Töne und Schreibweise nach der Tonart", () => {
    expect(scaleNoteNames(9, scaleById("minorPentatonic"))).toEqual(["A", "C", "D", "E", "G"]);
    expect(scaleNoteNames(5, scaleById("major"))).toEqual(["F", "G", "A", "B", "C", "D", "E"]); // F-Dur mit B
    expect(scaleNoteNames(2, scaleById("major"))).toEqual(["D", "E", "F♯", "G", "A", "H", "C♯"]);
    expect(scaleNoteNames(0, scaleById("minor"))).toEqual(["C", "D", "E♭", "F", "G", "A♭", "B"]); // wie Es-Dur
    expect(scaleLabel(7, scaleById("dorian"))).toBe("G Dorisch");
  });

  it("nimmt die Leitertöne ab dem tiefsten Grundton und endet auf einem Grundton", () => {
    const am = scaleById("minorPentatonic");
    const range = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64]; // E2 … E4
    expect(scalePitches(range, 9, am, 1)).toEqual([45, 48, 50, 52, 55, 57]);
    expect(scalePitches(range, 9, am, 0)).toEqual([45, 48, 50, 52, 55, 57]); // bis A3, nicht mitten in der Oktave
    expect(scalePitches([40, 43, 47], 9, am, 1)).toEqual([40, 43]); // kein A im Bereich: alle Leitertöne
  });

  it("greift die Tonleiter in einer Lage", () => {
    const pitches = candidatePitches(guitar, { strings: [0, 5], frets: [5, 8] }, false);
    const seq = fingerSequence([45, 48, 50, 52, 55, 57], pitches); // A-Moll-Pentatonik in der 5. Lage
    expect(seq.map((t) => [t.string, t.fret])).toEqual([[0, 5], [0, 8], [1, 5], [1, 7], [2, 5], [2, 7]]);
  });

  it("baut die Übungsfolge auf und ab, mit Wiederholung ohne doppelten Grundton", () => {
    const pitches = candidatePitches(guitar, { strings: [0, 5], frets: [5, 8] }, false);
    const am = scaleById("minorPentatonic");
    const once = scaleTargets(pitches, 9, am, 1, "upDown", false).map((t) => t.midi);
    expect(once).toEqual([45, 48, 50, 52, 55, 57, 55, 52, 50, 48, 45]);
    expect(scaleTargets(pitches, 9, am, 1, "upDown", true)).toHaveLength(10);
    expect(scaleTargets(pitches, 9, am, 1, "down", false).map((t) => t.midi)).toEqual([57, 55, 52, 50, 48, 45]);
    const fMajor = scaleTargets(pitches, 5, scaleById("major"), 1, "up", false);
    expect(fMajor.find((t) => t.midi === 58)).toMatchObject({ flat: true }); // B statt A♯
  });

  it("wählt zufällige Leitertöne in der Schreibweise der Tonart", () => {
    const eb = scaleById("major");
    const pitches = scalePositions(guitar, { strings: [0, 5], frets: [0, 5] }, 3, eb);
    expect([...pitches.keys()].every((m) => [3, 5, 7, 8, 10, 0, 2].includes(m % 12))).toBe(true);
    const source = scaleRandomSource(pitches, seededRandom(4), 3, eb);
    let t = source(null);
    for (let i = 0; i < 30 && t; i++) {
      if (![0, 2, 5, 7].includes(t.midi % 12)) expect(t.flat).toBe(true);
      t = source(t);
    }
  });
});
