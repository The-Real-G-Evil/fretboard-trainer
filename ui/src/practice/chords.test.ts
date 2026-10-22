import { describe, expect, it } from "vitest";
import { chordSymbol, judgeChord, requiredTones } from "./chords";
import { onPlayedChord, onPlayedNote, startPractice } from "./engine";
import { sequenceSource, type TargetSource } from "./generator";
import { expire, onBeat, onTimedChord, onTimedNote, startTimed, type TimedConfig } from "./timed";

const ev = (tones: [number, boolean, boolean?][]) => ({
  timeMs: 0, tones: tones.map(([midi, present, shared]) => ({ midi, present, strength: present ? 1 : 0, shared: !!shared })),
});

describe("Akkorde", () => {
  it("verlangt je Stufe genug Akkordtöne", () => {
    expect([requiredTones(4, "easy"), requiredTones(4, "medium"), requiredTones(4, "hard")]).toEqual([2, 3, 4]);
    expect(requiredTones(2, "medium")).toBe(2);
    expect(requiredTones(1, "veryEasy")).toBe(1);
  });

  it("bewertet je Akkordton, Oktavverdopplungen zählen nicht", () => {
    const c = [48, 52, 55, 60];
    expect(judgeChord(ev([[48, true], [52, false], [55, true], [60, true, true]]), c, "medium"))
      .toEqual({ hit: true, present: 2, judged: 3, missing: [52] });
    expect(judgeChord(ev([[48, true], [52, false], [55, true], [60, true, true]]), c, "hard")?.hit).toBe(false);
    expect(judgeChord(ev([[48, true], [52, true]]), c, "hard")).toBeNull(); // Ergebnis zu anderen Tönen
  });

  it("benennt Akkorde", () => {
    expect(chordSymbol([45, 52, 57, 60, 64])).toBe("Am");
    expect(chordSymbol([40, 47, 52])).toBe("E5");
    expect(chordSymbol([43, 47, 50, 55, 59, 65])).toBe("G7");
    expect(chordSymbol([52, 55, 60])).toBe("C/E");
    expect(chordSymbol([46, 50, 53], true)).toBe("B"); // B-Dur (deutsch)
    expect(chordSymbol([47, 50, 54])).toBe("Hm");
    expect(chordSymbol([48, 49, 50])).toBe("C-C♯-D");
  });
});

describe("Akkorde in der Tonfolge", () => {
  const cChord = { midi: 48, string: 1, fret: 3, chord: [{ midi: 48, string: 1, fret: 3 }, { midi: 52, string: 2, fret: 2 }, { midi: 55, string: 3, fret: 0 }] };
  const single = { midi: 57, string: 4, fret: 2 };

  it("Warte-Modus: Einzeltöne zählen am Akkord nicht, die Akkordprüfung entscheidet", () => {
    const source = sequenceSource([cChord, single], false);
    let s = startPractice(source, 0);
    expect(onPlayedNote(s, { midi: 48, cents: 0, timeMs: 0, onsetType: "pick" }, 25, source, 100, "medium")).toBe(s);
    s = onPlayedChord(s, ev([[48, true], [52, false], [55, false]]), source, 200, "medium");
    expect(s.last).toMatchObject({ kind: "chordMiss", missing: [52, 55] });
    expect(s.queue[0].chord).toBeDefined();
    s = onPlayedChord(s, ev([[48, true], [52, false], [55, true]]), source, 300, "medium"); // Mittel: einer darf fehlen
    expect(s.last).toMatchObject({ kind: "hit", chord: { present: 2, judged: 3 } });
    expect(s.queue[0].midi).toBe(57);
    expect(s.stats).toMatchObject({ hits: 1, misses: 1 });
  });

  it("getakteter Modus: Akkord im Fenster, Verpassen erst nach dem Ergebnis der Akkordprüfung", () => {
    const config: TimedConfig = { bpm: 120, beatsPerNote: 2, toleranceBeats: 0.25, countInBeats: 4, compensationMs: 0, difficulty: "hard" };
    const source = sequenceSource([cChord, single], false);
    let s = onBeat(startTimed(config, source), { timeMs: 10_000 }); // Akkord fällig bei 12 000 ms, Fenster ±125 ms
    expect(onTimedNote(s, { midi: 48, cents: 0, timeMs: 12_000, onsetType: "pick" }, source)).toBe(s);
    expect(expire(s, 12_200, source)).toBe(s); // Ergebnis der Akkordprüfung steht noch aus
    const missed = ev([[48, true], [52, true], [55, false]]);
    expect(onTimedChord(s, { ...missed, timeMs: 12_050 }, source).last).toMatchObject({ kind: "chordMiss", missing: [55] });
    s = onTimedChord(s, { ...ev([[48, true], [52, true], [55, true]]), timeMs: 12_050 }, source);
    expect(s.last).toMatchObject({ kind: "hit", errorMs: 50, chord: { present: 3, judged: 3 } });
    expect(expire(startTimedAt(config, source), 12_500, source).last?.kind).toBe("missed");
  });
});

function startTimedAt(config: TimedConfig, source: TargetSource) {
  return onBeat(startTimed(config, source), { timeMs: 10_000 });
}
