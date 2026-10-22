import "@fontsource/noto-music/music-400.css";
import { ACCIDENTAL_GLYPH, ledgerLines, spell, staffStep, type Clef } from "../music/notation";

export interface StaffNote {
  midi: number; // klingende Tonhöhe
  flat?: boolean; // Ton mit Vorzeichen als ♭ notieren (sonst ♯)
  state: "current" | "upcoming" | "hit" | "miss" | "plain";
  label?: string; // z. B. Notenname unter der Note
  color?: string; // eigene Farbe des Notenkopfs (Heatmap)
  slur?: "H" | "P"; // mit der vorigen Note gebunden: Hammer-on bzw. Pull-off
  chord?: number[]; // Akkord: alle Töne (klingend), gleiche Schreibweise wie midi
}

/** Notenköpfe eines Akkords von unten nach oben: Sekunden nebeneinander, Vorzeichen gestaffelt. */
function chordHeads(midis: number[], clef: Clef, flat?: boolean) {
  const heads = [...new Set(midis)]
    .map((m) => ({ step: stepOf(m, clef, flat), accidental: spell(m + clef.octaveShift, flat).accidental }))
    .sort((a, b) => a.step - b.step);
  let shifted = false;
  let column = 0, lastAccStep = -99;
  return heads.map((h, i) => {
    // Sekunde zum Kopf darunter: diesen nach rechts (abwechselnd, bei Clustern)
    shifted = i > 0 && h.step - heads[i - 1].step === 1 ? !shifted : false;
    // Vorzeichen, die einander zu nahe kommen, weiter nach links
    let accColumn = 0;
    if (h.accidental !== 0) {
      column = h.step - lastAccStep < 6 ? column + 1 : 0;
      accColumn = column;
      lastAccStep = h.step;
    }
    return { ...h, shifted, accColumn };
  });
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
  const steps = [...notes.flatMap((n) => (n.chord ?? [n.midi]).map((m) => stepOf(m, clef, n.flat))),
                 ...[...(sizeFor ?? [])].map((m) => stepOf(m, clef))];
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
        if (n.chord && n.chord.length > 1) {
          const cx = x(i);
          const heads = chordHeads(n.chord, clef, n.flat);
          const style = n.color ? { fill: n.color } : undefined;
          const ledgers = [...new Set(heads.flatMap((h) => ledgerLines(h.step)))];
          const anyShifted = heads.some((h) => h.shifted);
          return (
            <g key={i} className={`staff-note ${n.state}`}>
              {ledgers.map((l) => (
                <line key={l} x1={cx - lineGap * 1.15} x2={cx + lineGap * (anyShifted ? 2.6 : 1.15)} y1={y(l)} y2={y(l)} className="staff-ledger" />
              ))}
              {heads.map((h, k) => {
                const hx = cx + (h.shifted ? lineGap * 1.44 : 0);
                return (
                  <g key={k}>
                    {h.accidental !== 0 && (
                      <text x={cx - lineGap * (1.55 + 1.1 * h.accColumn)} y={y(h.step) + lineGap * 3 * (h.accidental === 1 ? 0.13 : 0.07)}
                            className="staff-accidental" fontSize={lineGap * 3} textAnchor="middle" style={style}>
                        {ACCIDENTAL_GLYPH[h.accidental]}
                      </text>
                    )}
                    <ellipse cx={hx} cy={y(h.step)} rx={lineGap * 0.72} ry={lineGap * 0.5} className="note-head" style={style} />
                    <ellipse cx={hx} cy={y(h.step)} rx={lineGap * 0.42} ry={lineGap * 0.24}
                             transform={`rotate(-35 ${hx} ${y(h.step)})`} className="note-hole" />
                  </g>
                );
              })}
              {n.label && (
                <text x={cx} y={height - lineGap * 0.4} textAnchor="middle" className="note-label">{n.label}</text>
              )}
            </g>
          );
        }
        const step = stepOf(n.midi, clef, n.flat);
        const accidental = spell(n.midi + clef.octaveShift, n.flat).accidental;
        const cx = x(i);
        // Bindebogen von der vorigen Note (über beiden Köpfen), Buchstabe H/P darüber
        const prev = i > 0 ? notes[i - 1] : null;
        const prevStep = prev ? stepOf(prev.midi, clef, prev.flat) : step;
        const arcTop = Math.min(y(prevStep), y(step)) - lineGap * 1.6;
        const slurPath = prev
          ? `M ${x(i - 1) + lineGap * 0.5} ${y(prevStep) - lineGap * 0.8} Q ${(x(i - 1) + cx) / 2} ${arcTop - lineGap * 0.6} ${cx - lineGap * (accidental !== 0 ? 2.2 : 0.5)} ${y(step) - lineGap * (accidental !== 0 ? 1.6 : 0.8)}`
          : null;
        return (
          <g key={i} className={`staff-note ${n.state}`}>
            {n.slur && slurPath && <path d={slurPath} className="staff-slur" />}
            {n.slur && (
              <text x={prev ? (x(i - 1) + cx) / 2 : cx} y={(prev ? arcTop : y(step) - lineGap * 1.4) - lineGap * 0.5}
                    textAnchor="middle" className="staff-slur-label" fontSize={lineGap * 0.9}>{n.slur}</text>
            )}
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
