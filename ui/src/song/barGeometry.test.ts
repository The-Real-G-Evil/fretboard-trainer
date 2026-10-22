import { describe, expect, it } from "vitest";
import { barAt, moveMarker } from "./barGeometry";

// zwei Zeilen à zwei Takte
const rects = [
  { x: 50, y: 100, w: 200, h: 120 }, { x: 250, y: 100, w: 200, h: 120 },
  { x: 50, y: 300, w: 300, h: 120 }, { x: 350, y: 300, w: 100, h: 120 },
];

describe("Bereichsbalken im Song-Modus", () => {
  it("findet den Takt unter dem Mauszeiger, auch neben und zwischen den Zeilen", () => {
    expect(barAt(rects, 60, 150)).toBe(0);
    expect(barAt(rects, 300, 150)).toBe(1);
    expect(barAt(rects, 400, 350)).toBe(3);
    expect(barAt(rects, 10, 350)).toBe(2); // links neben der Zeile
    expect(barAt(rects, 600, 150)).toBe(1); // rechts daneben
    expect(barAt(rects, 300, 240)).toBe(1); // knapp unter Zeile 1
    expect(barAt(rects, 300, 290)).toBe(2); // knapp über Zeile 2
    expect(barAt([], 0, 0)).toBe(-1);
  });

  it("hält Anfang vor dem Ende", () => {
    expect(moveMarker("start", 5, 2, 8)).toEqual([5, 8]);
    expect(moveMarker("start", 10, 2, 8)).toEqual([10, 10]);
    expect(moveMarker("end", 1, 2, 8)).toEqual([1, 1]);
    expect(moveMarker("end", 12, 2, 8)).toEqual([2, 12]);
  });
});
