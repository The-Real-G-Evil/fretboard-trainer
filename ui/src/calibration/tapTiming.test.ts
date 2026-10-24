import { describe, expect, it } from "vitest";
import { deviationFor, evaluateTaps, MIN_TAPS } from "./tapTiming";

const BEAT = 750; // 80 BPM
const beats = (n: number, latencyMs = 10) => Array.from({ length: n }, (_, i) => ({ timeMs: 1000 + i * BEAT, latencyMs }));

describe("Timing-Messung", () => {
  it("rechnet die Treiber-Latenz heraus und nimmt den Median", () => {
    const b = beats(16);
    const onsets = b.map((x, i) => x.timeMs + 10 + 40 + (i % 2 ? 6 : -6)); // 40 ms nach dem Klick, ±6 ms
    const r = evaluateTaps(b, onsets, BEAT)!;
    expect(r.offsetMs).toBe(40);
    expect(r.deviations).toHaveLength(16);
    expect(r.missed).toBe(0);
    expect(r.spreadMs).toBeGreaterThan(0);
    expect(r.spreadMs).toBeLessThanOrEqual(9);
  });

  it("zu frühe Anschläge ergeben einen negativen Ausgleich", () => {
    const b = beats(12, 0);
    expect(evaluateTaps(b, b.map((x) => x.timeMs - 25), BEAT)!.offsetMs).toBe(-25);
  });

  it("ignoriert Anschläge zwischen den Klicks und doppelte Anschläge", () => {
    const b = beats(12, 0);
    const onsets = b.flatMap((x) => [x.timeMs + 20, x.timeMs + 22, x.timeMs + BEAT / 2]);
    const r = evaluateTaps(b, onsets, BEAT)!;
    expect(r.deviations).toEqual(Array(12).fill(20));
    expect(deviationFor(1000 + BEAT / 2, b, BEAT)).toBeNull();
  });

  it("Ausreißer verschieben den Median kaum", () => {
    const b = beats(12, 0);
    const onsets = b.map((x, i) => x.timeMs + (i === 3 ? 250 : 30));
    expect(evaluateTaps(b, onsets, BEAT)!.offsetMs).toBe(30);
  });

  it("zu wenige Anschläge: kein Ergebnis", () => {
    const b = beats(16, 0);
    expect(evaluateTaps(b, b.slice(0, MIN_TAPS - 1).map((x) => x.timeMs + 30), BEAT)).toBeNull();
  });
});
