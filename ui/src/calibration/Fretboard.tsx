import { stringNumber, type Instrument } from "../instruments";
import { isNatural } from "../music/notation";
import { noteName } from "../music/names";
import type { ExerciseNote } from "./exercises";
import type { ChipState } from "./NoteChip";
import { t } from "../i18n";

interface FretboardProps {
  instrument: Instrument;
  notes: ExerciseNote[];
  states: ChipState[]; // je Note, gleiche Reihenfolge wie notes
  currentIndex?: number; // aktueller Ton während der Aufnahme (zeigt die Legato-Bögen dazu)
  spotLabel?: (note: ExerciseNote, indices: number[]) => string; // Beschriftung der Griffstellen
  noteNames?: "none" | "faint" | "full"; // Tonnamen in allen Bünden (Nachschlagekarte)
  fretCount?: number; // so viele Bünde zeigen (sonst aus den Noten)
  activeFrets?: [number, number]; // Bünde außerhalb werden abgeschwächt (Übungsbereich)
  activeStrings?: [number, number];
  heat?: (midi: number) => { color: string; title: string } | undefined; // Heatmap je Ton
}

/** Fingersatz „ein Finger pro Bund“: Bund 1–4 → Finger 1–4, Bund 5–8 → wieder 1–4, … ; leer = 0. */
export const fingerFor = (fret: number) => (fret === 0 ? 0 : ((fret - 1) % 4) + 1);

const STRING_GAP = 24;
const FRET_W = 58;
const OPEN_W = 46; // Bereich links vom Sattel für Leersaiten
const LABEL_W = 34;
const TOP = 16;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

// Wichtigkeit eines Zustands, wenn mehrere Töne auf derselben Stelle liegen
const PRIORITY: ChipState[] = ["current", "wrong", "wrongPitch", "missing", "wrongType", "pending", "ok", "correct"];

/** Griffbrett-Ansicht (Blick wie auf eine Tabulatur: höchste Saite oben). Jede Stelle, die in
    der Übung vorkommt, zeigt die Reihenfolge der Töne; der aktuelle Ton ist hervorgehoben. */
export function Fretboard({
  instrument, notes, states, currentIndex, spotLabel, noteNames = "none", fretCount, activeFrets, activeStrings, heat,
}: FretboardProps) {
  const n = instrument.strings.length;
  const maxFret = Math.min(instrument.frets, fretCount ?? Math.max(5, ...notes.map((x) => x.fret)) + 1);
  const width = LABEL_W + OPEN_W + maxFret * FRET_W + 10;
  const height = TOP + (n - 1) * STRING_GAP + 34;

  const y = (string: number) => TOP + (n - 1 - string) * STRING_GAP;
  const x = (fret: number) => (fret === 0 ? LABEL_W + OPEN_W / 2 : LABEL_W + OPEN_W + (fret - 0.5) * FRET_W);
  const nutX = LABEL_W + OPEN_W;

  // Töne auf derselben Stelle zusammenfassen
  const spots = new Map<string, { string: number; fret: number; indices: number[] }>();
  notes.forEach((note, i) => {
    const key = `${note.string}:${note.fret}`;
    if (!spots.has(key)) spots.set(key, { string: note.string, fret: note.fret, indices: [] });
    spots.get(key)!.indices.push(i);
  });

  const spotState = (indices: number[]) =>
    indices.map((i) => states[i]).sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0];

  const orderLabel = (indices: number[]) =>
    indices.length <= 2 ? indices.map((i) => i + 1).join("·") : `${indices[0] + 1}…`;
  const label = (indices: number[]) => (spotLabel ? spotLabel(notes[indices[0]], indices) : orderLabel(indices));

  const inRange = (string: number, fret: number) =>
    (!activeFrets || (fret >= activeFrets[0] && fret <= activeFrets[1])) &&
    (!activeStrings || (string >= activeStrings[0] && string <= activeStrings[1]));

  return (
    <svg className="fretboard" viewBox={`0 0 ${width} ${height}`} role="img"
         aria-label={t("Griffbrett {name} mit {n} Tönen", { name: instrument.name, n: notes.length })}>
      {/* Griffbrett */}
      <rect x={nutX} y={TOP - 8} width={maxFret * FRET_W} height={(n - 1) * STRING_GAP + 16} className="fb-wood" rx={3} />

      {/* Lagenmarkierungen */}
      {instrument.fretted &&
        INLAYS.filter((f) => f <= maxFret).map((f) => (
          <circle key={f} cx={x(f)} cy={TOP + ((n - 1) * STRING_GAP) / 2} r={4} className="fb-inlay" />
        ))}
      {instrument.fretted && maxFret >= 12 && (
        <>
          <circle cx={x(12)} cy={TOP + STRING_GAP * 0.5} r={4} className="fb-inlay" />
          <circle cx={x(12)} cy={TOP + (n - 1.5) * STRING_GAP} r={4} className="fb-inlay" />
        </>
      )}

      {/* Bünde bzw. Lagen-Hilfslinien bei bundlosen Instrumenten */}
      {Array.from({ length: maxFret }, (_, i) => i + 1).map((f) => (
        <line key={f} x1={nutX + f * FRET_W} x2={nutX + f * FRET_W} y1={TOP - 8} y2={TOP + (n - 1) * STRING_GAP + 8}
              className={instrument.fretted ? "fb-fret" : "fb-position"} />
      ))}
      <line x1={nutX} x2={nutX} y1={TOP - 8} y2={TOP + (n - 1) * STRING_GAP + 8} className="fb-nut" />

      {/* Saiten mit Namen */}
      {instrument.strings.map((s, i) => (
        <g key={i}>
          <line x1={LABEL_W + 6} x2={width - 10} y1={y(i)} y2={y(i)} className="fb-string"
                strokeWidth={1 + (i < n / 2 ? (n / 2 - i) * 0.35 : 0)} />
          <text x={LABEL_W - 6} y={y(i) + 4} className="fb-label" textAnchor="end">
            {instrument.fretted ? `${stringNumber(instrument, i)} ${s.name}` : s.name}
          </text>
        </g>
      ))}

      {/* Bundnummern */}
      <text x={x(0)} y={height - 6} className="fb-num" textAnchor="middle">{t("leer")}</text>
      {Array.from({ length: maxFret }, (_, i) => i + 1).map((f) => (
        <text key={f} x={x(f)} y={height - 6} className="fb-num" textAnchor="middle">{f}</text>
      ))}

      {/* Tonnamen in allen Bünden (Nachschlagekarte), Stammtöne hervorgehoben */}
      {noteNames !== "none" &&
        instrument.strings.map((s, i) =>
          Array.from({ length: maxFret + 1 }, (_, f) => {
            if (spots.has(`${i}:${f}`)) return null;
            const midi = s.midi + f;
            const name = noteName(midi).name;
            const natural = isNatural(midi);
            const h = heat?.(midi);
            const cls = `fb-name ${natural ? "natural" : "accidental"} ${noteNames} ${inRange(i, f) ? "" : "outside"} ${heat ? (h ? "heat" : "no-data") : ""}`;
            return (
              <g key={`n${i}:${f}`} className={cls}>
                {h && <title>{h.title}</title>}
                <rect x={x(f) - 12} y={y(i) - 8} width={24} height={16} rx={4} style={h ? { fill: h.color } : undefined} />
                <text x={x(f)} y={y(i) + 4} textAnchor="middle">{name}</text>
              </g>
            );
          }),
        )}

      {/* Legato-Bögen zum und vom aktuellen Ton (alle auf einmal wären zu unübersichtlich) */}
      {notes.map((note, i) => {
        const prev = notes[i - 1];
        if (note.type !== "legato" || !prev || prev.string !== note.string) return null;
        if (currentIndex === undefined || (i !== currentIndex && i !== currentIndex + 1)) return null;
        // aufwärts (Hammer-on) über der Saite, abwärts (Pull-off) darunter
        const up = note.fret > prev.fret;
        const x1 = x(prev.fret), x2 = x(note.fret);
        const yy = y(note.string) + (up ? -11 : 11);
        const bend = up ? -9 : 9;
        return <path key={`s${i}`} d={`M ${x1} ${yy} Q ${(x1 + x2) / 2} ${yy + bend} ${x2} ${yy}`} className="fb-slur" />;
      })}

      {/* Griffstellen */}
      {[...spots.values()].map((spot) => {
        const state = spotState(spot.indices);
        return (
          <g key={`${spot.string}:${spot.fret}`} className={`fb-spot ${state}`}>
            <circle cx={x(spot.fret)} cy={y(spot.string)} r={state === "current" ? 12 : 10} />
            <text x={x(spot.fret)} y={y(spot.string) + 4} textAnchor="middle">{label(spot.indices)}</text>
          </g>
        );
      })}
    </svg>
  );
}
