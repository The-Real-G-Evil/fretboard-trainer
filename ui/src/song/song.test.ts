import { exporter, Settings } from "@coderline/alphatab";
import { describe, expect, it } from "vitest";
import { extractNotes, parseAlphaTex, parseSong, songInfo } from "./gpImport";

// Saiten in alphaTex: Bund.Saite, Saite 1 = höchste
const TEX = String.raw`
\title "Probe"
\artist "Test"
.
\track "Bass"
\tuning (G2 D2 A1 E1)
:4 3.4 5.4 (2.3 4.3) r | 0.3 2.3{h} 4.3 3.2 | 5.1 5.1 -.4 x.4 |
\track "Gitarre"
\tuning (E4 B3 G3 D3 A2 E2)
:4 0.1 1.2 2.3 3.4 | r r r r | 0.6 0.6 0.6 0.6 |
`;

describe("Guitar-Pro-Import", () => {
  it("liest Spuren mit Stimmung (tiefste Saite zuerst)", () => {
    const info = songInfo(parseAlphaTex(TEX));
    expect(info).toMatchObject({ title: "Probe", artist: "Test", bars: 3 });
    expect(info.tracks.map((t) => [t.name, t.tuning])).toEqual([
      ["Bass", [28, 33, 38, 43]],
      ["Gitarre", [40, 45, 50, 55, 59, 64]],
    ]);
  });

  it("macht aus einer Spur die Tonfolge ohne Pausen, Bindungen, Dead Notes und Akkorde", () => {
    const { notes, skippedChords } = extractNotes(parseAlphaTex(TEX), 0);
    expect(skippedChords).toBe(1);
    expect(notes.map((n) => n.midi)).toEqual([31, 33, 33, 35, 37, 41, 48, 48]);
    expect(notes[0]).toMatchObject({ string: 0, fret: 3, bar: 0, legato: false }); // G1 auf der E-Saite
    expect(notes[4]).toMatchObject({ string: 1, fret: 4, legato: true }); // Ziel des Hammer-ons
    expect(notes.at(-1)).toMatchObject({ string: 3, fret: 5, bar: 2 });
  });

  it("schreibt Vorzeichen nach der Tonart des Takts", () => {
    const { notes } = extractNotes(parseAlphaTex(String.raw`
      \track "Bass"
      \tuning (G2 D2 A1 E1)
      \ks Bb
      :4 1.3 r r r |
      \ks D
      1.3 r r r |
    `), 0);
    expect(notes.map((n) => [n.midi, n.flat])).toEqual([[34, true], [34, false]]);
  });

  it("liest Lieder, deren Takte unterschiedlich viele Stimmen haben (Fehler in alphaTab 1.8.4)", () => {
    const score = parseAlphaTex(String.raw`
      \track "Bass"
      \tuning (G2 D2 A1 E1)
      \voice
      :4 3.4 r r r | 5.4 r r r |
      \voice
      :4 0.1 r r r |
    `);
    score.tracks[0].staves[0].bars[1].voices.pop(); // wie in echten GPX-Dateien: Takt 2 nur mit Stimme 1
    expect(() => score.finish(new Settings())).not.toThrow();
    expect(extractNotes(score, 0).notes.map((n) => n.midi)).toEqual([31, 33]);
  });

  it("liest Guitar-Pro-Dateien (hier: GP7-Export derselben Noten)", () => {
    const bytes = new exporter.Gp7Exporter().export(parseAlphaTex(TEX), new Settings());
    const score = parseSong(bytes);
    expect(songInfo(score).tracks).toHaveLength(2);
    expect(extractNotes(score, 1).notes.map((n) => n.midi)).toEqual([64, 60, 57, 53, 40, 40, 40, 40]);
    expect(() => parseSong(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
