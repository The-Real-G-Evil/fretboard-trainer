import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS, PRESETS, sameEffects, UNITS, userPresets } from "./effects";

describe("Effekte", () => {
  it("Regler liegen in den Bereichen des Kerns, Presets auch", () => {
    for (const u of UNITS) for (const k of u.knobs) {
      expect(DEFAULT_EFFECTS[k.key]).toBeGreaterThanOrEqual(k.min);
      expect(DEFAULT_EFFECTS[k.key]).toBeLessThanOrEqual(k.max);
      for (const p of PRESETS) {
        expect(p.params[k.key], `${p.name}: ${k.key}`).toBeGreaterThanOrEqual(k.min);
        expect(p.params[k.key], `${p.name}: ${k.key}`).toBeLessThanOrEqual(k.max);
      }
    }
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
  });

  it("erkennt das aktive Preset und ergänzt eigene Presets um fehlende Werte", () => {
    expect(sameEffects(PRESETS[2].params, { ...PRESETS[2].params })).toBe(true);
    expect(sameEffects(PRESETS[2].params, { ...PRESETS[2].params, driveDb: 15 })).toBe(false);
    expect(userPresets({ "effects.presets": { Mein: { reverbOn: true } } }).Mein).toEqual({ ...DEFAULT_EFFECTS, reverbOn: true });
    expect(userPresets({})).toEqual({});
  });
});
