import { describe, expect, it } from "vitest";
import { isDeviation, itemTimes, percent } from "./review";

describe("Review", () => {
  it("ordnet erwartete Noten auf der Zeitachse ein", () => {
    const segments = [{ start: 1, end: 1.3, midi: 40, cents: 0, pick: true }, { start: 3, end: 3.2, midi: 45, cents: 0, pick: true }];
    const items = [
      { midis: [40], live: "hit" as const, verdict: "hit" as const, segment: 0 },
      { midis: [43], live: "miss" as const, verdict: "missed" as const, segment: -1 },
      { midis: [44], live: "miss" as const, verdict: "missed" as const, segment: -1, timeSec: 2.5 },
      { midis: [45], live: "hit" as const, verdict: "hit" as const, segment: 1 },
      { midis: [47], live: "miss" as const, verdict: "missed" as const, segment: -1 },
    ];
    expect(itemTimes({ items, segments, durationSec: 5 })).toEqual([1, 1.75, 2.5, 3, 4]);
    expect(items.map(isDeviation)).toEqual([false, true, true, false, true]);
    expect(percent(13, 15)).toBe(87);
  });
});
