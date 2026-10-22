import { describe, expect, it } from "vitest";
import { instrumentById } from "../instruments";
import { sequenceSource, seededRandom } from "../practice/generator";
import { parseAlphaTex } from "./gpImport";
import { quarters, rhythmBar, rhythmExercise } from "./rhythm";
import { songTimeline } from "./songTiming";
import { modeAvailable, playMode, toleranceBeats } from "../practice/timing";
import { difficultyById } from "../practice/engine";

const guitar = instrumentById("guitar6");

describe("Rhythmus-Übung", () => {
  it("füllt jeden Takt genau, je Stufe mit passenden Notenwerten", () => {
    for (const level of ["simple", "medium", "hard"] as const) {
      const random = seededRandom(level.length);
      for (let i = 0; i < 200; i++) {
        const bar = rhythmBar(level, random);
        expect(bar.reduce((a, e) => a + quarters(e), 0)).toBe(4);
        if (level === "simple") expect(bar.every((e) => !e.rest && !e.dotted && e.value <= 4)).toBe(true);
        if (level !== "hard") expect(bar.some((e) => e.value === 16)).toBe(false);
      }
    }
  });

  it("ergibt ein Lied mit Notenlängen, das wie ein GP-Lied abgespielt und bewertet wird", () => {
    const notes = [40, 43, 45, 47, 45].map((midi, i) => ({ midi, string: 0, fret: midi - 40, legato: i === 2 }));
    const { tex, notes: count } = rhythmExercise(guitar, sequenceSource(notes, true), seededRandom(3),
      { bars: 4, level: "hard", bpm: 90 });
    const score = parseAlphaTex(tex);
    expect(score.tempo).toBe(90);
    expect(score.tracks[0].staves[0].tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(score.masterBars).toHaveLength(4);
    for (const bar of score.tracks[0].staves[0].bars) // Punktierungen und Pausen zählen: jeder Takt ist voll
      expect(bar.voices[0].beats.reduce((a, b) => a + b.playbackDuration, 0)).toBe(3840);
    const t = songTimeline(score, 0);
    expect(t.beats).toHaveLength(count);
    expect(t.endMs).toBeCloseTo(4 * 4 * (60000 / 90), 0); // vier volle Takte
    expect(t.beats.slice(0, 5).map((b) => b.midis[0])).toEqual([40, 43, 45, 47, 45]);
    expect(t.beats[0]).toMatchObject({ string: 0, fret: 0 });
    // gebunden nur direkt nach einer Note auf derselben Saite (hier alle auf der tiefen E-Saite)
    expect(t.beats.some((b) => b.legato)).toBe(true);
  });

  it("füllt mit Pausen auf, wenn die Tonfolge zu Ende ist", () => {
    const { notes } = rhythmExercise(guitar, sequenceSource([{ midi: 40, string: 0, fret: 0 }], false), seededRandom(1),
      { bars: 2, level: "simple", bpm: 60 });
    expect(notes).toBe(1);
  });
});

describe("Stufe Ultra", () => {
  it("spielt Rhythmus mit Notenlängen (Lied: Song-Modus) im engsten Fenster", () => {
    expect(playMode("auto", "ultra", false)).toBe("rhythm");
    expect(playMode("auto", "ultra", true)).toBe("songPlay");
    expect(playMode("rhythm", "easy", true)).toBe("wait"); // Rhythmus gibt es nur ohne Lied
    expect(modeAvailable("rhythm", false) && !modeAvailable("songPlay", false)).toBe(true);
    expect(toleranceBeats("ultra")).toBe(0.08);
    expect(difficultyById("ultra")).toMatchObject({ name: "Ultra", legato: true, showName: false });
  });
});
