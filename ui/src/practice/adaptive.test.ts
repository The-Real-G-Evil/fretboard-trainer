import { describe, expect, it } from "vitest";
import type { NoteStatRow } from "../api";
import { adaptiveWeights, statsByPitch, weightFor } from "./adaptive";
import { nextTarget, seededRandom, weighted, type Target } from "./generator";

const row = (midi: number, attempts: number, hits: number, extra: Partial<NoteStatRow> = {}): NoteStatRow => ({
  midi, string: -1, fret: -1, attempts, hits, avgReactionMs: 800, avgTimingAbsMs: 20,
  lastPracticed: new Date().toISOString(), ...extra,
});

describe("Adaptive Gewichte", () => {
  it("fasst Griffpositionen eines Tons zusammen", () => {
    const s = statsByPitch([row(40, 4, 2, { string: 0, fret: 12, avgReactionMs: 1000 }), row(40, 6, 6, { avgReactionMs: 500 })]);
    expect(s.get(40)).toMatchObject({ attempts: 10, hits: 8 });
    expect(s.get(40)!.avgReactionMs).toBeCloseTo((1000 * 2 + 500 * 6) / 8);
  });

  it("schwache Töne wiegen mehr als sichere, neue liegen dazwischen", () => {
    const strong = weightFor(statsByPitch([row(40, 30, 30)]).get(40), "wait");
    const weak = weightFor(statsByPitch([row(41, 30, 12)]).get(41), "wait");
    const fresh = weightFor(undefined, "wait");
    expect(strong).toBeLessThan(fresh);
    expect(weak).toBeGreaterThan(fresh);
  });

  it("langsame Reaktion bzw. ungenaues Timing erhöhen das Gewicht", () => {
    const fast = weightFor(statsByPitch([row(40, 20, 20, { avgReactionMs: 700 })]).get(40), "wait");
    const slow = weightFor(statsByPitch([row(40, 20, 20, { avgReactionMs: 3500 })]).get(40), "wait");
    expect(slow).toBeGreaterThan(fast + 1);
    const tight = weightFor(statsByPitch([row(40, 20, 20, { avgTimingAbsMs: 10 })]).get(40), "timed");
    const loose = weightFor(statsByPitch([row(40, 20, 20, { avgTimingAbsMs: 110 })]).get(40), "timed");
    expect(loose).toBeGreaterThan(tight + 1);
  });

  it("lange nicht geübte Töne kommen wieder öfter", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const recent = weightFor(statsByPitch([row(40, 20, 20, { lastPracticed: "2026-10-21T10:00:00Z" })]).get(40), "wait", now);
    const old = weightFor(statsByPitch([row(40, 20, 20, { lastPracticed: "2026-10-07T10:00:00Z" })]).get(40), "wait", now);
    expect(old).toBeGreaterThan(recent + 0.9);
  });

  it("der Generator wählt proportional zum Gewicht", () => {
    const pitches = new Map<number, Target[]>([
      [40, [{ midi: 40, string: 0, fret: 0 }]],
      [41, [{ midi: 41, string: 0, fret: 1 }]],
      [43, [{ midi: 43, string: 0, fret: 3 }]],
    ]);
    const weights = adaptiveWeights(pitches.keys(), [row(40, 40, 40), row(41, 40, 10), row(43, 40, 40)], "wait");
    const random = weighted(seededRandom(9), weights);
    const counts = new Map<number, number>();
    for (let i = 0; i < 3000; i++) {
      const t = nextTarget(pitches, null, random)!;
      counts.set(t.midi, (counts.get(t.midi) ?? 0) + 1);
    }
    const share41 = counts.get(41)! / 3000;
    const expected = weights.get(41)! / [...weights.values()].reduce((a, b) => a + b, 0);
    expect(share41).toBeGreaterThan(0.5); // der schwache Ton dominiert
    expect(Math.abs(share41 - expected)).toBeLessThan(0.03);
  });
});
