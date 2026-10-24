// Timing-Messung: Zum Metronom werden gedämpfte Saiten angetippt. Aus den Anschlägen relativ zu den
// Klicks ergibt sich der persönliche Timing-Ausgleich (timing.offsetMs) – also das, was nach Abzug der
// Treiber-Latenz noch übrig bleibt (Wandler, Plugins, eigenes Spielgefühl).

export interface TimedBeat {
  timeMs: number;
  latencyMs: number;
}

export interface TimingResult {
  deviations: number[]; // je gewertetem Anschlag: Abweichung zum Klick (ms, + = später), ohne Treiber-Latenz
  offsetMs: number; // Median, gerundet und begrenzt – Vorschlag für den Timing-Ausgleich
  spreadMs: number; // typische Abweichung vom Median (MAD, auf Standardabweichung skaliert)
  missed: number; // Klicks ohne Anschlag
}

export const COUNT_IN_BEATS = 4;
export const MEASURE_BEATS = 16;
export const MIN_TAPS = 8;
const MAX_OFFSET = 300;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Abweichung eines Anschlags zum nächsten Klick, wenn er näher als 40 % des Schlagabstands liegt. */
export function deviationFor(onsetMs: number, beats: TimedBeat[], beatMs: number): { beat: number; dev: number } | null {
  let best: { beat: number; dev: number } | null = null;
  beats.forEach((b, i) => {
    const dev = onsetMs - b.latencyMs - b.timeMs;
    if (Math.abs(dev) <= beatMs * 0.4 && (!best || Math.abs(dev) < Math.abs(best.dev))) best = { beat: i, dev };
  });
  return best;
}

/** Ordnet Anschläge den Klicks zu (je Klick der erste passende) und wertet aus. */
export function evaluateTaps(beats: TimedBeat[], onsets: number[], beatMs: number): TimingResult | null {
  const perBeat = new Map<number, number>();
  for (const t of onsets) {
    const d = deviationFor(t, beats, beatMs);
    if (d && !perBeat.has(d.beat)) perBeat.set(d.beat, d.dev);
  }
  const deviations = [...perBeat.entries()].sort((a, b) => a[0] - b[0]).map(([, dev]) => dev);
  if (deviations.length < MIN_TAPS) return null;
  const med = median(deviations);
  const spread = 1.4826 * median(deviations.map((d) => Math.abs(d - med)));
  return {
    deviations,
    offsetMs: Math.round(Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, med))),
    spreadMs: Math.round(spread),
    missed: beats.length - deviations.length,
  };
}
