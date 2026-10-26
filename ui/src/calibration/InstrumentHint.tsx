import { dominantOctaveOffset, instrumentShiftedBy, type Instrument } from "../instruments";
import { t } from "../i18n";

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
  const amount = octaves === 1
    ? (offset < 0 ? t("eine Oktave tiefer") : t("eine Oktave höher"))
    : (offset < 0 ? t("{n} Oktaven tiefer", { n: octaves }) : t("{n} Oktaven höher", { n: octaves }));
  const suggestion = instrumentShiftedBy(instrument, offset);

  return (
    <div className="instrument-hint" role="alert">
      <span>
        {t("Die Töne klingen {amount} als für „{name}“ erwartet.", { amount, name: instrument.name })}{" "}
        {suggestion ? t("Spielst du vielleicht {name}?", { name: suggestion.name }) : t("Ist das richtige Instrument gewählt?")}
      </span>
      {suggestion && <button className="primary" onClick={() => onSwitchInstrument(suggestion.id)}>{t("Zu {name} wechseln", { name: suggestion.name })}</button>}
    </div>
  );
}
