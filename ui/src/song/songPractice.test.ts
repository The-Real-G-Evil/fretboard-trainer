import { describe, expect, it } from "vitest";
import { instrumentById } from "../instruments";
import { tunedInstrument } from "../music/tunings";
import { startPractice, onPlayedNote } from "../practice/engine";
import { sequenceSource } from "../practice/generator";
import type { SongNote } from "./gpImport";
import { lowestPosition, mixFor, problemBars, songBpm, songOf, songTargets, suggestTrack, tuningFromSong, withMix, withRecent } from "./songPractice";

const bass = instrumentById("bass4"); // E1 A1 D2 G2
const n = (midi: number, string: number, fret: number, bar: number): SongNote =>
  ({ midi, flat: false, string, fret, bar, legato: false });
const note = (midi: number) => ({ midi, cents: 0, timeMs: 0, onsetType: "pick" as const });

describe("Lied als Notenquelle", () => {
  const notes = [n(33, 1, 0, 0), n(35, 1, 2, 0), n(38, 2, 0, 1), n(26, 0, 0, 2)]; // D1 nur in Drop D
  const dropD = [26, 33, 38, 43];

  it("übernimmt Griffstellen bei gleicher Stimmung, sonst tiefster Bund", () => {
    const same = songTargets(notes, dropD, tunedInstrument(bass, { id: "dropD", offsets: [-2, 0, 0, 0] }), 0, -1);
    expect(same.ownPositions).toBe(true);
    expect(same.unplayable).toBe(0);
    expect(same.targets.map((t) => [t.string, t.fret])).toEqual([[1, 0], [1, 2], [2, 0], [0, 0]]);

    const standard = songTargets(notes, dropD, bass, 0, -1);
    expect(standard.ownPositions).toBe(false);
    expect(standard.unplayable).toBe(1); // D1 liegt unter der leeren E-Saite und entfällt
    expect(standard.targets.map((t) => t.midi)).toEqual([33, 35, 38]);
    expect(standard.targets[2]).toMatchObject({ midi: 38, string: 2, fret: 0 });
    expect(lowestPosition(bass, 45)).toEqual({ string: 3, fret: 2 }); // A2: G-Saite 2. Bund statt D-Saite 7.
  });

  it("beschränkt auf den Taktbereich", () => {
    expect(songTargets(notes, dropD, bass, 1, 1).targets.map((t) => t.midi)).toEqual([38]);
    const tunedDropD = tunedInstrument(bass, { id: "dropD", offsets: [-2, 0, 0, 0] });
    expect(songTargets(notes, dropD, tunedDropD, 1, -1).targets.map((t) => t.bar)).toEqual([1, 2]);
  });

  it("schlägt die Stimmung der Spur vor", () => {
    expect(tuningFromSong(bass, dropD)).toEqual({ id: "dropD", offsets: [-2, 0, 0, 0] });
    expect(tuningFromSong(bass, [23, 33, 38, 43])?.offsets).toEqual([-5, 0, 0, 0]);
    expect(tuningFromSong(bass, [40, 45, 50, 55, 59, 64])).toBeNull(); // Gitarrenspur
  });

  it("spielt die Folge bis zum Ende oder wiederholt sie", () => {
    const targets = songTargets(notes.slice(0, 3), dropD, bass, 0, -1).targets;
    let s = startPractice(sequenceSource(targets, false), 0);
    expect(s.queue.map((t) => t.midi)).toEqual([33, 35, 38]);
    for (const m of [33, 35, 38]) s = onPlayedNote(s, note(m), 25, sequenceSource(targets, false), 0);
    expect(s.queue).toHaveLength(0);
    expect(s.stats.hits).toBe(3);

    const loop = sequenceSource(targets, true);
    expect(startPractice(loop, 0).queue.map((t) => t.midi)).toEqual([33, 35, 38, 33]);
  });

  it("führt die Liste zuletzt geöffneter Lieder", () => {
    const r = withRecent([{ path: "a", name: "A" }, { path: "b", name: "B" }], { path: "b", name: "B" });
    expect(r.map((x) => x.path)).toEqual(["b", "a"]);
  });
});

describe("Spurwahl nach Instrument", () => {
  const tracks = [
    { index: 0, name: "Combo 1", tuning: [40, 45, 50, 55, 59, 64], percussion: false },
    { index: 1, name: "Drums", tuning: [], percussion: true },
    { index: 2, name: "Bass", tuning: [28, 33, 38, 43], percussion: false },
    { index: 3, name: "Bass 2 (Drop D)", tuning: [26, 33, 38, 43], percussion: false },
  ];

  it("nimmt beim Bass die Bassspur in der eigenen Stimmung", () => {
    expect(suggestTrack(tracks, bass)).toBe(2);
    expect(suggestTrack(tracks, tunedInstrument(bass, { id: "dropD", offsets: [-2, 0, 0, 0] }))).toBe(3);
  });

  it("nimmt bei der Gitarre die Gitarrenspur, ohne Schlagzeug", () => {
    expect(suggestTrack(tracks, instrumentById("guitar6"))).toBe(0);
    expect(suggestTrack([tracks[1]], bass)).toBe(-1);
  });
});

describe("Problemstellen und Liedtempo", () => {
  it("findet die schwächsten Takte mit genug Versuchen", () => {
    const stats = [
      { bar: 0, attempts: 10, hits: 10 }, // sicher
      { bar: 3, attempts: 8, hits: 4 },
      { bar: 4, attempts: 2, hits: 0 }, // zu wenig Versuche
      { bar: 7, attempts: 12, hits: 6 }, // gleiche Quote, mehr Versuche
      { bar: 9, attempts: 5, hits: 4 },
    ];
    expect(problemBars(stats).map((b) => b.bar)).toEqual([7, 3, 9]);
    expect(problemBars(stats, 3, 1).map((b) => b.bar)).toEqual([7]);
  });

  it("nimmt das Tempo am Anfang des Taktbereichs, skaliert", () => {
    const tempos = [102, 100, 99, 98];
    expect(songBpm(tempos, 0, 100)).toBe(102);
    expect(songBpm(tempos, 2, 50)).toBe(50); // 49,5 gerundet
    expect(songBpm(tempos, 9, 100)).toBe(98); // hinter dem Ende: letzter Takt
    expect(songBpm([], 0, 100)).toBeNull();
  });
});

describe("Mischpult im Song-Modus", () => {
  it("startet mit leiser eigener Spur und merkt sich Änderungen je Lied", () => {
    const song = { ...songOf({}), path: "a.gpx", track: 2 };
    expect(mixFor(song, 3).map((m) => m.volume)).toEqual([1, 1, 0.3]);
    const changed = withMix(song, mixFor(song, 3).map((m, i) => (i === 0 ? { ...m, mute: true } : m)));
    expect(mixFor(changed, 3)[0]).toEqual({ volume: 1, mute: true, solo: false });
    expect(mixFor({ ...changed, path: "b.gpx" }, 3)[0].mute).toBe(false); // anderes Lied: eigenes Mischpult
  });
});

describe("Ordner des letzten Lieds", () => {
  it("schneidet den Dateinamen ab (Windows- und Unix-Pfade)", async () => {
    const { folderOf } = await import("../practice/SongPanel");
    expect(folderOf(String.raw`Z:\Projekte\Fretboard Trainer\gpx\Lied.gpx`)).toBe(String.raw`Z:\Projekte\Fretboard Trainer\gpx`);
    expect(folderOf("/home/a/Lied.gp5")).toBe("/home/a");
    expect(folderOf("")).toBe("");
  });
});
