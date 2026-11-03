import { describe, expect, it } from "vitest";
import { toleranceBeats } from "./timing";

describe("toleranceBeats", () => {
  it("skaliert das Fenster der Stufe", () => {
    expect(toleranceBeats("medium", "normal")).toBeCloseTo(0.25);
    expect(toleranceBeats("medium", "strict")).toBeCloseTo(0.175);
    expect(toleranceBeats("hard", "generous")).toBeCloseTo(0.225);
  });
  it("hält bei hohem Tempo eine Mindestbreite in ms", () => {
    // 160 BPM: Viertel 375 ms; „Großzügig“ mindestens 150 ms = 0,4 Schläge
    expect(toleranceBeats("veryHard", "generous", 160)).toBeCloseTo(0.4);
    expect(toleranceBeats("veryHard", "normal", 160)).toBeCloseTo(100 / 375);
  });
  it("höchstens einen halben Schlag", () => {
    expect(toleranceBeats("medium", "generous", 240)).toBe(0.5);
  });
});
