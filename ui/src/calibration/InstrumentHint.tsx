import { dominantOctaveOffset, instrumentShiftedBy, type Instrument } from "../instruments";

interface InstrumentHintProps {
  instrument: Instrument;
  pairs: { expected: number; detected: number }[]; // erwartete und tatsächlich erkannte Töne
  onSwitchInstrument: (id: string) => void;
}

/** Erscheint, wenn mehrere Töne genau um Oktaven versetzt erkannt werden – meist ist dann
    ein anderes Instrument gewählt als gespielt wird (z. B. Gitarre statt Bass). */
export function InstrumentHint({ instrument, pairs, onSwitchInstrument }: InstrumentHintProps) {
  const offset = dominantOctaveOffset(pairs);
  if (offset === null) return null;

  const octaves = Math.abs(offset) / 12;
  const direction = offset < 0 ? "tiefer" : "höher";
  const suggestion = instrumentShiftedBy(instrument, offset);

  return (
    <div className="instrument-hint" role="alert">
      <span>
        Die Töne klingen {octaves === 1 ? "eine Oktave" : `${octaves} Oktaven`} {direction} als für „{instrument.name}“
        erwartet. {suggestion ? `Spielst du vielleicht ${suggestion.name}?` : "Ist das richtige Instrument gewählt?"}
      </span>
      {suggestion && <button className="primary" onClick={() => onSwitchInstrument(suggestion.id)}>Zu {suggestion.name} wechseln</button>}
    </div>
  );
}
