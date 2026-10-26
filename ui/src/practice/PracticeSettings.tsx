import { useId } from "react";
import { noteName } from "../api";
import { stringNumber, type Instrument } from "../instruments";
import { CLEFS, type ClefId } from "../music/notation";
import { presetTuning, tunedInstrument, tuningPresets, type Tuning } from "../music/tunings";
import { candidatePitches, type PracticeRange } from "./generator";
import type { InstrumentPractice } from "./settings";
import { t } from "../i18n";

interface PracticeSettingsProps {
  instrument: Instrument; // Vorlage (Standardstimmung)
  practice: InstrumentPractice;
  onChange: (p: InstrumentPractice) => void;
}

const MAX_OFFSET = 7; // so weit lässt sich eine Saite frei umstimmen (Halbtöne)

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function PracticeSettings({ instrument, practice, onChange }: PracticeSettingsProps) {
  const tuned = tunedInstrument(instrument, practice.tuning);
  const presets = tuningPresets(instrument);
  const noteCount = candidatePitches(tuned, practice.range, true).size;
  const set = (patch: Partial<InstrumentPractice>) => onChange({ ...practice, ...patch });
  const setRange = (patch: Partial<PracticeRange>) => set({ range: { ...practice.range, ...patch } });

  const setStringOffset = (index: number, offset: number) => {
    const offsets = [...practice.tuning.offsets];
    offsets[index] = offset;
    const custom: Tuning = { id: "custom", offsets };
    // passt die Eingabe zu einer Vorlage, diese anzeigen
    const match = presets.find((p) => presetTuning(instrument, p.id).offsets.every((o, i) => o === offsets[i]));
    set({ tuning: match ? { id: match.id, offsets } : custom });
  };

  const stringLabel = (i: number) => `${stringNumber(tuned, i)} (${tuned.strings[i].name})`;

  return (
    <div className="fields practice-settings">
      <Field label={t("Stimmung")}>
        {(id) => (
          <select id={id} value={practice.tuning.id}
                  onChange={(e) => e.target.value !== "custom" && set({ tuning: presetTuning(instrument, e.target.value) })}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="custom">{t("Eigene Stimmung")}</option>
          </select>
        )}
      </Field>

      <div className="tuning-strings" role="group" aria-label={t("Stimmung je Saite")}>
        {[...instrument.strings.keys()].reverse().map((i) => {
          const midi = tuned.strings[i].midi;
          const n = noteName(midi);
          const offset = practice.tuning.offsets[i];
          return (
            <div key={i} className="tuning-string">
              <span className="hint">{stringNumber(instrument, i)}</span>
              <button aria-label={t("einen Halbton tiefer")} disabled={offset <= -MAX_OFFSET}
                      onClick={() => setStringOffset(i, offset - 1)}>−</button>
              <span className={`tuning-note ${offset !== 0 ? "changed" : ""}`}>{n.name}<sub>{n.octave}</sub></span>
              <button aria-label={t("einen Halbton höher")} disabled={offset >= MAX_OFFSET}
                      onClick={() => setStringOffset(i, offset + 1)}>+</button>
            </div>
          );
        })}
      </div>

      <Field label={t("Schlüssel")}>
        {(id) => (
          <select id={id} value={practice.clef} onChange={(e) => set({ clef: e.target.value as ClefId })}>
            {CLEFS.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
          </select>
        )}
      </Field>

      <Field label={t("Saiten")}>
        {(id) => (
          <div className="range-pair">
            <select id={id} value={practice.range.strings[0]}
                    onChange={(e) => setRange({ strings: [Number(e.target.value), Math.max(Number(e.target.value), practice.range.strings[1])] })}>
              {tuned.strings.map((_, i) => <option key={i} value={i}>{stringLabel(i)}</option>)}
            </select>
            <span className="hint">{t("bis")}</span>
            <select aria-label={t("bis Saite")} value={practice.range.strings[1]}
                    onChange={(e) => setRange({ strings: [Math.min(practice.range.strings[0], Number(e.target.value)), Number(e.target.value)] })}>
              {tuned.strings.map((_, i) => <option key={i} value={i}>{stringLabel(i)}</option>)}
            </select>
          </div>
        )}
      </Field>

      <Field label={instrument.fretted ? t("Bünde") : t("Lagen (Halbtöne)")}>
        {(id) => (
          <div className="range-pair">
            <select id={id} value={practice.range.frets[0]}
                    onChange={(e) => setRange({ frets: [Number(e.target.value), Math.max(Number(e.target.value), practice.range.frets[1])] })}>
              {Array.from({ length: instrument.frets + 1 }, (_, f) => <option key={f} value={f}>{f === 0 ? t("leer") : f}</option>)}
            </select>
            <span className="hint">{t("bis")}</span>
            <select aria-label={t("bis Bund")} value={practice.range.frets[1]}
                    onChange={(e) => setRange({ frets: [Math.min(practice.range.frets[0], Number(e.target.value)), Number(e.target.value)] })}>
              {Array.from({ length: instrument.frets + 1 }, (_, f) => <option key={f} value={f}>{f === 0 ? t("leer") : f}</option>)}
            </select>
          </div>
        )}
      </Field>

      <p className="hint">
        {t("{n} verschiedene Stammtöne im Übungsbereich (ab Stufe „Schwer“ kommen Töne mit ♯/♭ dazu, bei „Hammer-ons und Pull-offs“ vereinzelt Hammer-on/Pull-off auf derselben Saite). Stimmung und Schlüssel gelten auch für Kalibrierung und Griffbrett.", { n: noteCount })}
      </p>
    </div>
  );
}
