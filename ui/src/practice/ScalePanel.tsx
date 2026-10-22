import { api } from "../api";
import { Fretboard } from "../calibration/Fretboard";
import type { Instrument } from "../instruments";
import { spell } from "../music/notation";
import {
  ROOTS, SCALE_ORDERS, SCALES, scaleById, scaleLabel, scaleNoteNames, type ScaleOrder,
} from "../music/scales";
import type { Target } from "./generator";
import type { InstrumentPractice, UiSettings } from "./settings";

export interface ScaleSettings {
  root: number; // Tonhöhenklasse 0 = C
  scale: string; // ScaleType.id
  order: ScaleOrder;
  octaves: number; // 0 = so weit der Übungsbereich reicht
  loop: boolean;
}

export const OCTAVE_CHOICES = [1, 2, 3, 0];

const DEFAULTS: ScaleSettings = { root: 9, scale: "minorPentatonic", order: "upDown", octaves: 1, loop: true };

export function scaleOf(ui: UiSettings): ScaleSettings {
  const s = (ui["practice.scale"] ?? {}) as Partial<ScaleSettings>;
  const root = Number(s.root);
  return {
    root: Number.isInteger(root) && root >= 0 && root < 12 ? root : DEFAULTS.root,
    scale: scaleById(String(s.scale ?? "")).id === s.scale ? s.scale! : DEFAULTS.scale,
    order: SCALE_ORDERS.some((o) => o.id === s.order) ? s.order! : DEFAULTS.order,
    octaves: OCTAVE_CHOICES.includes(Number(s.octaves)) ? Number(s.octaves) : DEFAULTS.octaves,
    loop: typeof s.loop === "boolean" ? s.loop : DEFAULTS.loop,
  };
}

export function saveScale(ui: UiSettings, s: ScaleSettings): UiSettings {
  api.setUiSetting("practice.scale", s);
  return { ...ui, "practice.scale": s };
}

interface ScalePanelProps {
  tuned: Instrument;
  practice: InstrumentPractice;
  scale: ScaleSettings;
  positions: Map<number, Target[]>; // alle Leitertöne im Übungsbereich
  sequence: Target[]; // Übungsfolge (leer bei zufälliger Reihenfolge)
  onChange: (s: ScaleSettings) => void;
}

/** Auswahl von Grundton, Tonleiter und Reihenfolge; das Griffbrett zeigt die Leitertöne im Übungsbereich. */
export function ScalePanel({ tuned, practice, scale, positions, sequence, onChange }: ScalePanelProps) {
  const type = scaleById(scale.scale);
  const set = (patch: Partial<ScaleSettings>) => onChange({ ...scale, ...patch });
  const spots = [...positions.values()].flat();
  const ordered = scale.order !== "random";
  const hasRoot = spots.some((t) => t.midi % 12 === scale.root);

  return (
    <>
      <div className="practice-timing">
        <label>
          <span>Grundton</span>
          <select value={scale.root} onChange={(e) => set({ root: Number(e.target.value) })}>
            {ROOTS.map((name, pc) => <option key={pc} value={pc}>{name}</option>)}
          </select>
        </label>
        <label>
          <span>Tonleiter</span>
          <select value={scale.scale} onChange={(e) => set({ scale: e.target.value })}>
            {SCALES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          <span>Reihenfolge</span>
          <select value={scale.order} onChange={(e) => set({ order: e.target.value as ScaleOrder })}>
            {SCALE_ORDERS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        {ordered && (
          <>
            <label title="Ab dem tiefsten Grundton im Übungsbereich">
              <span>Umfang</span>
              <select value={scale.octaves} onChange={(e) => set({ octaves: Number(e.target.value) })}>
                {OCTAVE_CHOICES.map((o) => (
                  <option key={o} value={o}>{o === 0 ? "ganzer Bereich" : `${o} Oktave${o > 1 ? "n" : ""}`}</option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={scale.loop} onChange={(e) => set({ loop: e.target.checked })} />
              <span>Wiederholen</span>
            </label>
          </>
        )}
      </div>
      <p>
        <strong>{scaleLabel(scale.root, type)}</strong>: {scaleNoteNames(scale.root, type).join(" ")}
        {ordered && sequence.length > 0 && <span className="hint"> · {sequence.length} Töne je Durchgang</span>}
      </p>
      <Fretboard
        instrument={tuned}
        notes={spots.map((t) => ({ ...t, type: "pick" as const }))}
        states={spots.map((t) => (t.midi % 12 === scale.root ? "current" : "pending"))}
        spotLabel={(note) => spell(note.midi, spots.find((t) => t.midi === note.midi)?.flat).name}
        fretCount={Math.max(12, practice.range.frets[1])}
        activeFrets={practice.range.frets}
        activeStrings={practice.range.strings}
      />
      <p className="hint">
        Hervorgehoben: Grundton. Gespielt wird im Übungsbereich – Lage und Saiten unter „Übungsbereich & Stimmung“.
        {spots.length === 0 && " Im Übungsbereich liegt kein Ton dieser Tonleiter."}
        {spots.length > 0 && !hasRoot && ordered && " Kein Grundton im Übungsbereich: die Folge beginnt beim tiefsten Leiterton."}
      </p>
    </>
  );
}
