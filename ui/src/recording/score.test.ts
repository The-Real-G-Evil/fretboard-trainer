import { describe, expect, it } from "vitest";
import { exporter } from "@coderline/alphatab";
import { instrumentById } from "../instruments";
import { parseAlphaTex } from "../song/gpImport";
import { beatTimeline, estimateTempo, freeTimeline, quantize, splitDuration, toAlphaTex, type HeardBeat, type PlayedNote } from "./score";

const bass = instrumentById("bass4");
const opt = { beatsPerBar: 4, steps: 4 as const, title: "Test", track: "Bass" };

/** Metronom mit 100 BPM (600 ms), betont alle vier Schläge, erster Schlag bei 1000 ms. */
const beats: HeardBeat[] = Array.from({ length: 24 }, (_, i) => ({ timeMs: 1000 + i * 600, accent: i % 4 === 0 }));

describe("Aufnahme als Noten", () => {
  it("schätzt das Tempo aus den Anschlägen", () => {
    const eighth = 300; // 100 BPM
    const starts = [0, 2, 3, 4, 6, 8, 9, 10, 12, 14, 16].map((k, i) => 500 + k * eighth + ((i * 7) % 5) - 2);
    expect(estimateTempo(starts)).toBeCloseTo(100, 0);
  });

  it("legt Töne am Metronom aufs Sechzehntelraster, Längen aus dem Notenende", () => {
    // Takt 1 (ab 1000 ms): Viertel E1, Viertel A1 (etwas zu früh), Halbe D2; dann leicht verspätete Achtel G2
    const notes: PlayedNote[] = [
      { midi: 28, startMs: 1004, endMs: 1580, legato: false },
      { midi: 33, startMs: 1590, endMs: 2190, legato: false },
      { midi: 38, startMs: 2200, endMs: 3390, legato: false },
      { midi: 43, startMs: 3412, endMs: 3690, legato: false },
    ];
    const grid = quantize(notes, beatTimeline(beats, notes[0].startMs, 4)!);
    expect(grid.map((n) => [n.pos, n.len])).toEqual([[0, 4], [4, 4], [8, 8], [16, 2]]);
  });

  it("verwirft den Vorzähler und Doppelanschläge auf demselben Schritt", () => {
    const notes: PlayedNote[] = [
      { midi: 28, startMs: 3400, legato: false }, // erster Ton auf Schlag 1 von Takt 2 (Index 4)
      { midi: 28, startMs: 3420, legato: false }, // Prellen: gleicher Schritt
      { midi: 33, startMs: 4000, legato: false },
    ];
    const grid = quantize(notes, beatTimeline(beats, notes[0].startMs, 4)!);
    expect(grid.map((n) => n.pos)).toEqual([0, 4]);
  });

  it("zerlegt Längen in Notenwerte", () => {
    expect(splitDuration(16)).toEqual([{ value: 1, dotted: false }]);
    expect(splitDuration(7)).toEqual([{ value: 4, dotted: true }, { value: 16, dotted: false }]);
    expect(splitDuration(5)).toEqual([{ value: 4, dotted: false }, { value: 16, dotted: false }]);
  });

  it("ergibt volle Takte mit Bindungen, Pausen und Hammer-on, exportierbar als Guitar Pro", () => {
    const tl = freeTimeline(0, 120, 4); // Sechzehntel = 125 ms
    const notes: PlayedNote[] = [
      { midi: 28, startMs: 0, endMs: 2500, legato: false },     // 20 Sechzehntel: über den Taktstrich gebunden
      { midi: 30, startMs: 2500, endMs: 3000, legato: true },   // Hammer-on auf der E-Saite (Bund 2)
      { midi: 33, startMs: 3500, endMs: 3750, legato: false },  // nach einer Pause
    ];
    const tex = toAlphaTex(quantize(notes, tl), bass, 120, opt);
    const score = parseAlphaTex(tex);
    expect(score.tempo).toBe(120);
    const bars = score.tracks[0].staves[0].bars;
    expect(bars).toHaveLength(2);
    for (const bar of bars) expect(bar.voices[0].beats.reduce((a, b) => a + b.playbackDuration, 0)).toBe(3840);
    const played = bars.flatMap((b) => b.voices[0].beats).filter((b) => !b.isRest).map((b) => b.notes[0]);
    expect(played[0]).toMatchObject({ fret: 0, string: 1 });             // E1 leer, tiefste Saite
    expect(played.some((n) => n.isTieDestination)).toBe(true);           // Bindung in Takt 2
    expect(played.some((n) => n.isHammerPullOrigin)).toBe(true);         // Bogen vor dem Hammer-on
    expect(played[played.length - 1]).toMatchObject({ fret: 0, string: 2 }); // A1 leer
    expect(new exporter.Gp7Exporter().export(score).length).toBeGreaterThan(1000);
  });

  it("schreibt andere Taktarten und lässt unspielbare Töne als Pause", () => {
    const tl = freeTimeline(0, 120, 2);
    const tex = toAlphaTex(quantize([{ midi: 20, startMs: 0, legato: false }, { midi: 40, startMs: 500, legato: false }], tl),
      bass, 120, { ...opt, beatsPerBar: 3, steps: 2 });
    const score = parseAlphaTex(tex);
    expect(score.masterBars[0].timeSignatureNumerator).toBe(3);
    const beatsOut = score.tracks[0].staves[0].bars[0].voices[0].beats;
    expect(beatsOut[0].isRest).toBe(true);
    expect(beatsOut.reduce((a, b) => a + b.playbackDuration, 0)).toBe(2880);
  });
});
