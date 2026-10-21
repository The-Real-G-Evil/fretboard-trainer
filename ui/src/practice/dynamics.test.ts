import { describe, expect, it } from "vitest";
import { DynamicsMeter, dynamicsFactor, narrowedWindow } from "./dynamics";

describe("Lautstärke-Bewertung", () => {
  it("bewertet erst nach drei Treffern gegen deren Median", () => {
    const m = new DynamicsMeter(6);
    for (const db of [-20, -22, -18]) {
      expect(m.rate(db)).toBeUndefined();
      m.addHit(db, m.rate(db));
    }
    expect(m.rate(-24)).toEqual({ deviationDb: -4, inWindow: true });
    expect(m.rate(-27)?.inWindow).toBe(false);
    expect(m.rate(undefined)).toBeUndefined(); // ohne Pegel (z. B. Vorschau) keine Bewertung
  });

  it("gibt außerhalb des Fensters weniger Punkte, ohne Bewertung volle", () => {
    expect(dynamicsFactor({ deviationDb: 2, inWindow: true })).toBe(1);
    expect(dynamicsFactor({ deviationDb: 9, inWindow: false })).toBe(0.75);
    expect(dynamicsFactor(undefined)).toBe(1);
  });

  it("fasst den Durchgang zusammen und stellt das Fenster nach gutem Durchgang enger", () => {
    const m = new DynamicsMeter(6);
    for (const db of [-20, -20, -20]) m.addHit(db, m.rate(db));
    for (let i = 0; i < 20; i++) {
      const db = i < 17 ? -20 + (i % 2 ? 3 : -3) : -30; // 17 im Fenster, 3 deutlich zu leise
      m.addHit(db, m.rate(db));
    }
    const s = m.summary();
    expect(s.rated).toBe(20);
    expect(s.inWindowRate).toBeCloseTo(0.85);
    expect(narrowedWindow(s)).toBe(5);
    expect(narrowedWindow({ ...s, inWindowRate: 0.7 })).toBe(6);
    expect(narrowedWindow({ ...s, rated: 10 })).toBe(6);
    expect(narrowedWindow({ ...s, windowDb: 2 })).toBe(2);
  });
});
