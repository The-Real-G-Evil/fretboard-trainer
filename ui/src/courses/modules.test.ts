import { describe, expect, it } from "vitest";
import { songOf } from "../song/songPractice";
import { allExercises, courseSongSettings, exerciseFile, exerciseKey, instrumentMatches, readModule, type CourseModule } from "./modules";

const manifest = {
  id: "bass-basics",
  title: "Bass-Grundlagen",
  instrument: "bass",
  lessons: [
    {
      title: "Chromatik",
      exercises: [
        { id: "001", title: "Finger 1-2-3-4", file: "uebungen/001.tex", bars: [3, 1], mode: "songPlay", loop: true,
          tempo: { start: 50, target: 150, step: 10 } },
        { id: "002", file: "002.gp5", track: 1, mode: "fliegen" },
        { id: "001", file: "x.tex" },
        { id: "003", file: "../geheim.tex" },
        { file: "C:/fremd.tex" },
      ],
    },
  ],
};

describe("Kurse: module.json", () => {
  const m = readModule({ path: "Z:\\Bass\\Module\\Basics", folder: "Z:\\Bass\\Module", manifest }) as CourseModule;

  it("liest Lektionen und Übungen und meldet fehlerhafte Angaben", () => {
    expect(m.title).toBe("Bass-Grundlagen");
    expect(allExercises(m).map((x) => x.exercise.id)).toEqual(["001", "002"]);
    const [a, b] = m.lessons[0].exercises;
    expect(a).toMatchObject({ bars: [1, 3], mode: "songPlay", loop: true, tempo: { start: 50, target: 150, step: 10 } });
    expect(b).toMatchObject({ title: "Übung 2", track: 1, mode: "auto", loop: false });
    expect(m.problems).toEqual([
      "Lektion 1, Übung 2: unbekannter Spielmodus „fliegen“",
      "Lektion 1, Übung 3: Id „001“ doppelt",
      "Lektion 1, Übung 4: Datei fehlt oder liegt außerhalb des Moduls",
      "Lektion 1, Übung 5: Datei fehlt oder liegt außerhalb des Moduls",
    ]);
    expect(exerciseKey(m, a)).toBe("bass-basics/001");
  });

  it("findet Dateien nur innerhalb des Moduls", () => {
    expect(exerciseFile("Z:\\Bass\\Module\\Basics", "uebungen/001.tex")).toBe("Z:\\Bass\\Module\\Basics\\uebungen\\001.tex");
    expect(exerciseFile("/home/u/Module/Basics/", "a.gp5")).toBe("/home/u/Module/Basics/a.gp5");
    expect(exerciseFile("Z:\\M", "..\\x.tex")).toBeNull();
    expect(exerciseFile("Z:\\M", "D:\\x.tex")).toBeNull();
  });

  it("passt zum Instrument (Familie oder genaue Id)", () => {
    expect(instrumentMatches(m, "bass5")).toBe(true);
    expect(instrumentMatches(m, "guitar6")).toBe(false);
    expect(instrumentMatches({ ...m, instrument: undefined }, "guitar6")).toBe(true);
  });

  it("übersetzt eine Übung in Lied-Einstellungen", () => {
    const s = courseSongSettings(songOf({}), m, m.lessons[0].exercises[0]);
    expect(s).toMatchObject({
      source: "song", path: "Z:\\Bass\\Module\\Basics\\uebungen\\001.tex", barFrom: 0, barTo: 2, loop: true,
      tempoPercent: 50, ramp: { on: true, target: 150, step: 10 },
    });
    expect(courseSongSettings(s, m, m.lessons[0].exercises[1])).toMatchObject({ track: 1, barFrom: 0, barTo: -1, ramp: { on: false } });
  });

  it("meldet ein unlesbares Modul", () => {
    expect(readModule({ path: "Z:\\M\\Kaputt", folder: "Z:\\M", error: "module.json ist kein gültiges JSON-Objekt" }))
      .toEqual({ path: "Z:\\M\\Kaputt", error: "module.json ist kein gültiges JSON-Objekt" });
  });
});
