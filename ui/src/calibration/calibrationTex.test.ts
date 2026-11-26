import { describe, expect, it } from "vitest";
import { instrumentById } from "../instruments";
import { parseAlphaTex } from "../song/gpImport";
import { calibrationScore } from "./calibrationTex";
import { exercisesFor } from "./exercises";

describe("Kalibrierung als Noten", () => {
  for (const id of ["guitar6", "bass4"]) {
    const inst = instrumentById(id);
    for (const ex of exercisesFor(inst)) {
      it(`${id}/${ex.id}: Töne, Takte und Länge stimmen`, () => {
        const s = calibrationScore(ex, inst);
        if (ex.kind === "silence") return void expect(s).toBeNull();
        expect(s).not.toBeNull();
        const score = parseAlphaTex(s!.tex);
        const notes = score.tracks[0].staves[0].bars.flatMap((b) => b.voices[0].beats.flatMap((be) => be.notes));
        expect(notes.map((n) => n.realValue)).toEqual(ex.notes.map((n) => n.midi));
        expect(score.masterBars.length).toBe(s!.bars);
        expect(s!.durationMs).toBeCloseTo((s!.bars * 4 * 60000) / ex.rhythm!.bpm);
      });
    }
  }

  it("Leersaiten: ganze Noten, ein Takt je Saite", () => {
    const inst = instrumentById("bass4");
    const ex = exercisesFor(inst).find((e) => e.id === "open-strings")!;
    expect(calibrationScore(ex, inst)!.bars).toBe(8);
  });
});
