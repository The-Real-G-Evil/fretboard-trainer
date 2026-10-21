import { noteName } from "../api";
import { stringNumber, type Instrument } from "../instruments";
import type { ExerciseNote } from "./exercises";

export type ChipState = "pending" | "current" | "ok" | "wrong" | "correct" | "wrongType" | "wrongPitch" | "missing";

interface NoteChipProps {
  note: ExerciseNote;
  instrument: Instrument;
  state: ChipState;
  detail?: string;
}

export function NoteChip({ note, instrument, state, detail }: NoteChipProps) {
  const n = noteName(note.midi);
  const position = instrument.fretted
    ? `${stringNumber(instrument, note.string)} · ${note.fret}`
    : `${instrument.strings[note.string].name}${note.fret > 0 ? ` +${note.fret}` : ""}`;

  return (
    <div className={`note-chip ${state} ${note.type}`} title={note.type === "legato" ? "Legato (nicht anschlagen)" : "anschlagen"}>
      <span className="chip-note">
        {note.type === "legato" && <span className="slur" aria-hidden>⌒</span>}
        {n.name}
        <sub>{n.octave}</sub>
      </span>
      <span className="chip-pos">{position}</span>
      {detail && <span className="chip-detail">{detail}</span>}
    </div>
  );
}
