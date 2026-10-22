// Lage der Takte in der Notenansicht (aus alphaTabs boundsLookup) für die Bereichsbalken im Song-Modus.

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Takt unter einem Punkt (Koordinaten der Notenansicht). Zwischen den Zeilen gilt die nächstgelegene
    Zeile; links/rechts davon der erste bzw. letzte Takt der Zeile. -1 = keine Takte. */
export function barAt(rects: (BarRect | undefined)[], px: number, py: number): number {
  let bestLine = Infinity;
  let lineTop = 0;
  // nächstgelegene Zeile (gleiche y/h) bestimmen
  for (const r of rects) {
    if (!r) continue;
    const d = py < r.y ? r.y - py : py > r.y + r.h ? py - (r.y + r.h) : 0;
    if (d < bestLine) {
      bestLine = d;
      lineTop = r.y;
    }
  }
  if (bestLine === Infinity) return -1;
  let first = -1, last = -1;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!r || r.y !== lineTop) continue;
    if (px >= r.x && px < r.x + r.w) return i;
    if (first < 0 || r.x < rects[first]!.x) first = i;
    if (last < 0 || r.x > rects[last]!.x) last = i;
  }
  return px < rects[first]!.x ? first : last;
}

/** Neuer Bereich, wenn ein Balken auf einen Takt gezogen wird: Anfang nie hinter dem Ende und umgekehrt. */
export function moveMarker(which: "start" | "end", bar: number, from: number, to: number): [number, number] {
  return which === "start" ? [bar, Math.max(bar, to)] : [Math.min(from, bar), bar];
}
