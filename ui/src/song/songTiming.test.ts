import { describe, expect, it } from "vitest";
import { parseAlphaTex } from "./gpImport";
import {
  barJump, expireSong, onSongChord, onSongPlayed, onSongWaitChord, onSongWaitPlayed, restartPass, songTimeline, startSongPlay,
  tickToMs,
} from "./songTiming";

const chord = (tones: [number, boolean][], shared: number[] = []) => ({
  timeMs: 0, tones: tones.map(([midi, present]) => ({ midi, present, strength: present ? 1 : 0, shared: shared.includes(midi) })),
});

// Takt 1–2 mit Wiederholung (2×), Takt 3 im halben Tempo; Saite 1 = höchste
const TEX = String.raw`
\tempo 120
.
\track "Bass"
\tuning (G2 D2 A1 E1)
\ro :4 3.4 r 5.4 r | \rc 2 :8 0.3 0.3 :4 2.3 :2 r |
\tempo 60 :4 0.4 (0.4 2.3) 0.4 -.4 |
\track "Gitarre"
\tuning (E4 B3 G3 D3 A2 E2)
:1 0.1 | 0.1 | 0.1 |
`;

describe("Zeitachse eines Lieds", () => {
  const score = parseAlphaTex(TEX);

  it("löst Wiederholungen auf und rechnet Tempowechsel in Millisekunden um", () => {
    const t = songTimeline(score, 0);
    expect(t.beats.map((b) => b.bar)).toEqual([0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(t.beats.map((b) => b.ms)).toEqual([0, 1000, 2000, 2250, 2500, 4000, 5000, 6000, 6250, 6500, 8000, 9000, 10000]);
    expect(t.beats[0]).toMatchObject({ midis: [31], string: 0, fret: 3, quarterMs: 500 });
    expect(t.beats[11]).toMatchObject({ midis: [28, 35], quarterMs: 1000 }); // Akkord
    expect(t.endMs).toBe(12000); // Bindebogen am Ende ist kein neuer Anschlag
    expect(tickToMs(t.tempo, 16320)).toBe(9000);
  });

  it("kennt die Taktanfänge in Wiedergabe-Reihenfolge und springt taktweise", () => {
    const t = songTimeline(score, 0);
    expect(t.barStarts.map((b) => [b.bar, b.tick])).toEqual([[0, 0], [1, 3840], [0, 7680], [1, 11520], [2, 15360]]);
    expect(barJump(t.barStarts, 5000, 1)).toBe(7680); // aus Takt 2 (1. Durchgang) einen vor: Wiederholung von Takt 1
    expect(barJump(t.barStarts, 5000, -1)).toBe(0);
    expect(barJump(t.barStarts, 5000, -5)).toBe(0); // nicht vor den Anfang
    expect(barJump(t.barStarts, 15360, 3)).toBe(15360); // nicht hinter den letzten Takt
  });

  it("beschränkt auf den Taktbereich (bei Wiederholungen das erste Vorkommen)", () => {
    const last = songTimeline(score, 0, 2, 2);
    expect(last.beats.map((b) => b.ms)).toEqual([8000, 9000, 10000]);
    expect([last.startMs, last.endMs]).toEqual([8000, 12000]);
    expect(songTimeline(score, 0, 0, 1).beats).toHaveLength(5);
    expect(songTimeline(score, 1).beats.map((b) => b.midis[0])).toEqual([64, 64, 64, 64, 64]); // ganze Noten, 2× wiederholt
  });
});

describe("Bewertung im Song-Modus", () => {
  const beats = songTimeline(parseAlphaTex(TEX), 0, 2, 2).beats; // 8000, 9000 (Akkord), 10000 ms; Viertel = 1000 ms

  it("wertet Mitspielen im Fenster, mit Fehlern und verpassten Noten", () => {
    let s = startSongPlay(beats);
    s = onSongPlayed(s, 8100, 28, 0.25, 0.5, "medium"); // 100 Lied-ms zu spät, halbes Tempo -> 200 ms
    expect(s.last).toMatchObject({ kind: "hit", errorMs: 200 });
    expect(s.cursor).toBe(1);
    expect(onSongPlayed(s, 8600, 40, 0.25, 1, "medium")).toBe(s); // zwischen den Noten: ignoriert
    expect(onSongPlayed(s, 9050, 40, 0.25, 1, "medium")).toBe(s); // Einzeltöne am Akkord: zählt die Akkordprüfung
    expect(onSongChord(s, 9050, chord([[28, true], [40, true]]), 0.25, 1, "medium")).toBe(s); // anderer Akkord
    s = onSongChord(s, 9050, chord([[28, true], [35, false]]), 0.25, 1, "medium"); // Mittel: bei zwei Tönen beide
    expect(s.last).toMatchObject({ kind: "chordMiss", missing: [35] });
    expect(s.cursor).toBe(1); // bleibt offen
    s = onSongChord(s, 9100, chord([[28, true], [35, true]]), 0.25, 1, "medium");
    expect(s.last).toMatchObject({ kind: "hit", chord: { present: 2, judged: 2 } });
    s = expireSong(s, 10300, 0.25); // Fenster der letzten Note vorbei
    expect(s.results.map((r) => r?.kind)).toEqual(["hit", "hit", "missed"]);
    expect(s.stats).toMatchObject({ hits: 2, misses: 2, streak: 0 });
    expect(restartPass(s).cursor).toBe(0);
  });

  it("wartet im Warte-Modus auf die erwartete Note", () => {
    let s = startSongPlay(beats);
    s = onSongWaitPlayed(s, 33, 0, "easy");
    expect(s.last?.kind).toBe("wrong");
    expect(s.cursor).toBe(0);
    s = onSongWaitPlayed(s, 28, 0, "easy");
    expect(s.last).toMatchObject({ kind: "hit", points: 125 }); // rechtzeitig: volle Punkte (Stufe Leicht ×1,25)
    expect(s.cursor).toBe(1);
    // Akkord: Einzeltöne zählen nicht; Leicht: die Hälfte der Akkordtöne genügt, Punkte anteilig
    expect(onSongWaitPlayed(s, 28, 0, "easy")).toBe(s);
    s = onSongWaitChord(s, chord([[28, true], [35, false]]), 0, "easy");
    expect(s.last).toMatchObject({ kind: "hit", chord: { present: 1, judged: 2 } });
    expect(s.cursor).toBe(2);
  });

  it("zählt Oktavverdopplungen im Akkord nicht mit", () => {
    const b = { ...beats[1], midis: [28, 35, 40] };
    const s = startSongPlay([b]);
    const next = onSongWaitChord(s, chord([[28, true], [35, true], [40, false]], [40]), 0, "hard");
    expect(next.last).toMatchObject({ kind: "hit", chord: { present: 2, judged: 2 } });
    expect(onSongWaitChord(s, chord([[28, true], [35, false], [40, true]], [40]), 0, "hard").last)
      .toMatchObject({ kind: "chordMiss", missing: [35] });
  });
});
