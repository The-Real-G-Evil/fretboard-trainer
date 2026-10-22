import { fingerFor, Fretboard } from "../calibration/Fretboard";
import type { Instrument } from "../instruments";
import type { DifficultyInfo } from "./engine";
import type { Target } from "./generator";
import type { InstrumentPractice } from "./settings";

interface TargetBoardProps {
  tuned: Instrument;
  practice: InstrumentPractice;
  level: DifficultyInfo;
  target: Target | undefined;
}

/** Griffbrett je Stufe: „Sehr leicht“ Griffstelle mit Finger, „Leicht“ nur die Tonnamen-Karte. */
export function TargetBoard({ tuned, practice, level, target }: TargetBoardProps) {
  if (!level.showNoteChart || !target) return null;
  const spots = (target.chord ?? [target]).map((t) => ({ midi: t.midi, string: t.string, fret: t.fret, type: "pick" as const }));
  return (
    <>
      <Fretboard
        instrument={tuned}
        notes={level.showFretboard ? spots : []}
        states={spots.map(() => "current" as const)}
        spotLabel={(note) => String(fingerFor(note.fret))}
        noteNames={level.showFretboard ? "faint" : "full"}
        fretCount={Math.max(12, practice.range.frets[1])}
        activeFrets={practice.range.frets}
        activeStrings={practice.range.strings}
      />
      {level.showFretboard && (
        <p className="hint">
          Zahl im Kreis = Finger (ein Finger pro Bund: Bund 1–4 → Finger 1–4, ab Bund 5 wieder von vorn; 0 = leere Saite)
        </p>
      )}
    </>
  );
}
