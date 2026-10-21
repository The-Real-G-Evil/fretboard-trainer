// Lautstärke-Bewertung: Wie gleichmäßig sind die Anschläge? Bezug ist der eigene Pegel im Durchgang
// (Median der letzten Treffer), nicht ein fester dBFS-Wert – der hinge von Verstärkung, Tonabnehmer
// und Instrument ab. Treffer außerhalb des Fensters bleiben Treffer, bringen aber weniger Punkte.

/** Wählbare Fenster (± dB um den Bezug), von großzügig bis eng. Enger als ±2 dB ist nicht sinnvoll:
    Saiten und Bünde klingen auch bei gleichem Anschlag leicht unterschiedlich laut. */
export const DYNAMICS_WINDOWS = [10, 8, 6, 5, 4, 3, 2];
export const DEFAULT_DYNAMICS_WINDOW = 6;

/** Punktefaktor für einen Treffer außerhalb des Fensters. */
export const OUTSIDE_WINDOW_FACTOR = 0.75;

const REFERENCE_SIZE = 8; // so viele Treffer bilden den Bezug
const MIN_REFERENCE = 3; // vorher wird nicht bewertet (Einschwingen)

export interface LevelRating {
  deviationDb: number; // + = lauter als der Bezug
  inWindow: boolean;
}

export const dynamicsFactor = (r: LevelRating | undefined) => (!r || r.inWindow ? 1 : OUTSIDE_WINDOW_FACTOR);

/** Bewertet Treffer gegen den Median der vorigen Treffer und führt die Bilanz des Durchgangs. */
export class DynamicsMeter {
  private recent: number[] = [];
  private deviations: number[] = [];

  constructor(readonly windowDb: number) {}

  /** Bewertung eines Pegels gegen die bisherigen Treffer (undefined: noch kein Bezug oder kein Pegel). */
  rate(levelDb: number | undefined): LevelRating | undefined {
    if (levelDb === undefined || this.recent.length < MIN_REFERENCE) return undefined;
    const sorted = [...this.recent].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const reference = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const deviationDb = levelDb - reference;
    return { deviationDb, inWindow: Math.abs(deviationDb) <= this.windowDb };
  }

  /** Treffer übernehmen (mit seiner Bewertung, falls es eine gab). */
  addHit(levelDb: number | undefined, rating: LevelRating | undefined) {
    if (levelDb === undefined) return;
    this.recent.push(levelDb);
    if (this.recent.length > REFERENCE_SIZE) this.recent.shift();
    if (rating) this.deviations.push(rating.deviationDb);
  }

  summary(): DynamicsSummary {
    const n = this.deviations.length;
    const inWindow = this.deviations.filter((d) => Math.abs(d) <= this.windowDb).length;
    const spreadDb = n ? Math.sqrt(this.deviations.reduce((a, d) => a + d * d, 0) / n) : 0;
    return { windowDb: this.windowDb, rated: n, inWindowRate: n ? inWindow / n : 0, spreadDb };
  }
}

export interface DynamicsSummary {
  windowDb: number;
  rated: number; // bewertete Treffer
  inWindowRate: number; // Anteil im Fenster
  spreadDb: number; // mittlere Abweichung (quadratisch)
}

/** Automatisch enger: nach einem Durchgang mit mindestens 20 bewerteten Treffern, von denen
    mindestens 80 % im Fenster lagen, das nächstengere Fenster (sonst bleibt es). */
export function narrowedWindow(s: DynamicsSummary): number {
  if (s.rated < 20 || s.inWindowRate < 0.8) return s.windowDb;
  return DYNAMICS_WINDOWS.find((w) => w < s.windowDb) ?? s.windowDb;
}

export const formatDeviation = (r: LevelRating) =>
  `${r.deviationDb >= 0 ? "+" : "−"}${Math.abs(r.deviationDb).toFixed(1).replace(".", ",")} dB`;
