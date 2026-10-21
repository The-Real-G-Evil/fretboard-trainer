import { describe, expect, it } from "vitest";
import { instrumentById } from "../instruments";
import { candidatePitches, fullRange, randomSource, seededRandom } from "./generator";
import { comboFactor, points, reactionAccuracy } from "./scoring";
import { expire, onBeat, onTimedNote, startTimed, tempoById, timingSummary, type TimedConfig } from "./timed";

const bass = instrumentById("bass4");
const pitches = candidatePitches(bass, fullRange(bass, 5), true);
const note = (midi: number, timeMs: number) => ({ midi, cents: 0, timeMs, onsetType: "pick" as const });

// 120 BPM: Schlag = 500 ms; Halbe = 2 Schläge; Fenster ±¼ Schlag = ±125 ms; 4 Schläge Vorzähler
const config: TimedConfig = {
  bpm: 120, beatsPerNote: 2, toleranceBeats: 0.25, countInBeats: 4, compensationMs: 30, difficulty: "medium",
};

function started(seed = 1) {
  const random = seededRandom(seed);
  let s = startTimed(config, randomSource(pitches, random));
  s = onBeat(s, { timeMs: 10_000 }); // erster Schlag nach dem Start bei 10 s
  return { s, random };
}

describe("Punkte", () => {
  it("Combo wächst um 5 % je Treffer, höchstens verdoppelt", () => {
    expect(comboFactor(1)).toBe(1);
    expect(comboFactor(3)).toBeCloseTo(1.1);
    expect(comboFactor(100)).toBe(2);
  });

  it("perfektes Timing gibt volle, knappes die halben Punkte", () => {
    expect(points(1, 1, "veryEasy")).toBe(100);
    expect(points(0, 1, "veryEasy")).toBe(50);
    expect(points(1, 1, "medium")).toBe(150);
  });

  it("Reaktionszeit im Warte-Modus", () => {
    expect(reactionAccuracy(300)).toBe(1);
    expect(reactionAccuracy(2000)).toBeCloseTo(0.5);
    expect(reactionAccuracy(9000)).toBe(0);
  });
});

describe("Getakteter Modus", () => {
  it("legt die Noten nach dem Vorzähler im Notenabstand auf die Schläge", () => {
    const { s } = started();
    expect(s.anchorMs).toBe(10_000);
    expect(s.notes.slice(0, 3).map((n) => n.dueBeat)).toEqual([4, 6, 8]);
    expect(tempoById("veryFast").beatsPerNote).toBe(0.5);
  });

  it("wertet Treffer im Fenster mit Timingfehler und Punkten (Latenz ausgeglichen)", () => {
    let { s, random } = started();
    const first = s.notes[0];
    // fällig bei 10 000 + 4·500 = 12 000 ms; erfasst 40 ms später, 30 ms davon Latenz -> 10 ms zu spät
    s = onTimedNote(s, note(first.midi, 12_040), randomSource(pitches, random));
    expect(s.cursor).toBe(1);
    expect(s.last).toMatchObject({ kind: "hit", errorMs: 10 });
    expect(s.stats).toMatchObject({ hits: 1, misses: 0, streak: 1 });
    expect(s.stats.score).toBe(points(1 - 10 / 125, 1, "medium"));
  });

  it("zu früh, falscher Ton und verpasste Note zählen als Fehler", () => {
    let { s, random } = started();
    const first = s.notes[0];

    s = onTimedNote(s, note(first.midi, 11_700), randomSource(pitches, random)); // 330 ms zu früh
    expect(s.last?.kind).toBe("early");
    expect(s.cursor).toBe(0);

    const wrong = [...pitches.keys()].find((m) => m !== first.midi)!;
    s = onTimedNote(s, note(wrong, 12_000), randomSource(pitches, random));
    expect(s.last).toMatchObject({ kind: "wrong", played: wrong });
    expect(s.cursor).toBe(0); // im Fenster darf noch korrigiert werden

    s = expire(s, 12_000 + 125 + 30 + 1, randomSource(pitches, random)); // Fenster vorbei
    expect(s.last?.kind).toBe("missed");
    expect(s.cursor).toBe(1);
    expect(s.notes[0].result?.kind).toBe("missed");
    expect(s.stats).toMatchObject({ hits: 0, misses: 3, streak: 0 });
  });

  it("schreibt immer genug Noten voraus und ignoriert den nachklingenden Ton", () => {
    let { s, random } = started(5);
    for (let i = 0; i < 20; i++) {
      const n = s.notes[s.cursor];
      const due = 10_000 + n.dueBeat * 500 + 30;
      s = onTimedNote(s, note(n.midi, due), randomSource(pitches, random));
      s = onTimedNote(s, note(n.midi, due + 200), randomSource(pitches, random)); // nochmal gemeldet
    }
    expect(s.stats).toMatchObject({ hits: 20, misses: 0, streak: 20 });
    expect(s.notes.length - s.cursor).toBeGreaterThanOrEqual(8);
    expect(timingSummary(s.stats.timingErrorsMs).absMeanMs).toBe(0);
  });

  it("vor dem ersten Schlag wird nichts bewertet", () => {
    const random = seededRandom(2);
    const s = startTimed(config, randomSource(pitches, random));
    expect(onTimedNote(s, note(s.notes[0].midi, 5_000), randomSource(pitches, random))).toBe(s);
  });
});
