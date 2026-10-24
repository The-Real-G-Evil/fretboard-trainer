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

describe("Rhythmus als Spielmodus", () => {
  it("ist frei wählbar (ohne Lied), die Stufen bleiben bei warten/getaktet", () => {
    expect(playMode("rhythm", "easy", false)).toBe("rhythm");
    expect(playMode("rhythm", "easy", true)).toBe("songWait"); // Rhythmus gibt es nur ohne Lied
    expect(playMode("auto", "veryHard", false)).toBe("timed");
    expect(modeAvailable("rhythm", false) && !modeAvailable("songPlay", false)).toBe(true);
    // Warten nur ohne Lied; beim Lied wählen die leichten Stufen „Lied wartet auf dich“
    expect(modeAvailable("wait", true)).toBe(false);
    expect(playMode("wait", "medium", true)).toBe("timed");
    expect(playMode("auto", "easy", true)).toBe("songWait");
    expect(playMode("auto", "easy", false)).toBe("wait");
    expect(toleranceBeats("veryHard")).toBe(0.1);
  });

  it("liest die frühere Stufe Ultra als „Hammer-ons und Pull-offs“", () => {
    expect(difficultyById("ultra")).toMatchObject({ id: "veryHard", name: "Hammer-ons und Pull-offs" });
  });
});
