import { describe, expect, it } from "vitest";
import { deviceLabel } from "./deviceName";

describe("Gerätenamen", () => {
  it("lässt die Windows-Nummer weg", () => {
    expect(deviceLabel("Mikrofon (2- Rocksmith USB Guitar Adapter)")).toBe("Mikrofon (Rocksmith USB Guitar Adapter)");
    expect(deviceLabel("Mikrofon (13- Rocksmith USB Guitar Adapter)")).toBe("Mikrofon (Rocksmith USB Guitar Adapter)");
    expect(deviceLabel("3- UMC204HD 192k")).toBe("UMC204HD 192k");
  });
  it("lässt andere Namen unverändert", () => {
    expect(deviceLabel("Line (UMC204HD 192k)")).toBe("Line (UMC204HD 192k)");
    expect(deviceLabel("Focusrite USB ASIO")).toBe("Focusrite USB ASIO");
    expect(deviceLabel("Kanal (2-4)")).toBe("Kanal (2-4)");
  });
});
