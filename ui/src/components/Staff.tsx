import "@fontsource/noto-music/music-400.css";
import { ACCIDENTAL_GLYPH, ledgerLines, spell, staffStep, type Clef } from "../music/notation";

export interface StaffNote {
  midi: number; // klingende Tonhöhe
  flat?: boolean; // Ton mit Vorzeichen als ♭ notieren (sonst ♯)
  state: "current" | "upcoming" | "hit" | "miss" | "plain";
  label?: string; // z. B. Notenname unter der Note
  color?: string; // eigene Farbe des Notenkopfs (Heatmap)
}

interface StaffProps {
  clef: Clef;
  notes: StaffNote[];
  lineGap?: number;
  slots?: number; // Breite in Notenplätzen (gleich große Darstellung, auch ohne Noten)
  sizeFor?: Iterable<number>; // alle möglichen Töne: Höhe bleibt beim Notenwechsel gleich
  spacing?: number; // Notenabstand in Linienabständen
}

const PAD_TOP = 7; // Mindestplatz für Hilfslinien über dem System (in Systemschritten)
const PAD_BOTTOM = 9; // darunter (tiefe Saiten in oktavierenden Schlüsseln)

const stepOf = (midi: number, clef: Clef, flat = false) => staffStep(midi, clef, flat);

/** Fünfliniensystem mit Schlüssel und Ganztonnoten (Stammtöne, Phase 3). */
export function Staff({ clef, notes, lineGap = 18, slots = 4, sizeFor, spacing = 5.5 }: StaffProps) {
  const half = lineGap / 2; // ein Systemschritt
  const clefW = lineGap * 4;
  const noteSpacing = lineGap * spacing;
  const steps = [...notes.map((n) => stepOf(n.midi, clef, n.flat)), ...[...(sizeFor ?? [])].map((m) => stepOf(m, clef))];
  // Höhe wächst mit weit entfernten Noten (z. B. Bass im Altschlüssel), damit nichts abgeschnitten wird
  const padTop = Math.max(PAD_TOP, ...steps.map((s) => s - 8 + 3));
  const padBottom = Math.max(PAD_BOTTOM, ...steps.map((s) => -s + 3));
  const width = clefW + lineGap * 2 + Math.max(slots, notes.length) * noteSpacing;
  const height = (8 + padTop + padBottom) * half + lineGap * 2.2;
  const bottomY = (8 + padTop) * half; // y der untersten Linie

  const y = (step: number) => bottomY - step * half;
  const x = (i: number) => clefW + lineGap * 2 + i * noteSpacing + noteSpacing / 2;

  return (
    <svg className="staff" viewBox={`0 0 ${width} ${height}`} role="img"
         aria-label={`Notensystem, ${clef.name}`}>
      {[0, 2, 4, 6, 8].map((s) => (
        <line key={s} x1={4} x2={width - 4} y1={y(s)} y2={y(s)} className="staff-line" />
      ))}

      {/* Schlüssel: Grundlinie der Schrift liegt auf der Bezugslinie (G-, F- bzw. C-Linie) */}
      <text x={lineGap * 0.6} y={y(clef.anchorLine * 2) + clef.baselineOffset * lineGap} className="staff-clef" fontSize={lineGap * 4}>
        {clef.glyph}
      </text>

      {notes.map((n, i) => {
        const step = stepOf(n.midi, clef, n.flat);
        const accidental = spell(n.midi + clef.octaveShift, n.flat).accidental;
        const cx = x(i);
        return (
          <g key={i} className={`staff-note ${n.state}`}>
            {ledgerLines(step).map((l) => (
              <line key={l} x1={cx - lineGap * 1.15} x2={cx + lineGap * 1.15} y1={y(l)} y2={y(l)} className="staff-ledger" />
            ))}
            {/* Ganze Note: gefüllte Ellipse mit schräg ausgesparter Innenfläche */}
            {accidental !== 0 && (
              // Grundlinie so, dass beim ♯ die Mitte, beim ♭ der Bauch auf Höhe der Note liegt (Noto Music)
              <text x={cx - lineGap * 1.55} y={y(step) + lineGap * 3 * (accidental === 1 ? 0.13 : 0.07)}
                    className="staff-accidental" fontSize={lineGap * 3}
                    textAnchor="middle" style={n.color ? { fill: n.color } : undefined}>
                {ACCIDENTAL_GLYPH[accidental]}
              </text>
            )}
            <ellipse cx={cx} cy={y(step)} rx={lineGap * 0.72} ry={lineGap * 0.5} className="note-head"
                     style={n.color ? { fill: n.color } : undefined} />
            <ellipse cx={cx} cy={y(step)} rx={lineGap * 0.42} ry={lineGap * 0.24}
                     transform={`rotate(-35 ${cx} ${y(step)})`} className="note-hole" />
            {n.label && (
              <text x={cx} y={height - lineGap * 0.4} textAnchor="middle" className="note-label">{n.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
