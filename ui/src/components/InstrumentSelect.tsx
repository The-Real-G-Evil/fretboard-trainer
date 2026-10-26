import { useId } from "react";
import { INSTRUMENTS, type Instrument } from "../instruments";
import { t } from "../i18n";

interface InstrumentSelectProps {
  instrument: Instrument;
  onChange: (id: string) => void;
}

/** Zentrale Instrumentwahl. Jedes Instrument hat ein eigenes Profil (Tonbereich und
    kalibrierte Erkennungsparameter); ein Wechsel lädt dieses Profil. */
export function InstrumentSelect({ instrument, onChange }: InstrumentSelectProps) {
  const id = useId();
  const strings = instrument.strings.map((s) => s.name).join(" ");

  return (
    <div className="field instrument-select">
      <label htmlFor={id}>Instrument</label>
      <select id={id} value={instrument.id} onChange={(e) => onChange(e.target.value)}>
        {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <span className="hint">
        {strings} · {instrument.fretted ? t("{n} Bünde", { n: instrument.frets }) : t("bundlos")}
      </span>
    </div>
  );
}
