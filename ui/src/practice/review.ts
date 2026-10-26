// Nachanalyse eines Durchgangs: Ergebnis an die Übungsseite weiterreichen (der Durchgang selbst ist dann
// schon ausgehängt).

import { api, type Review, type ReviewItem, type ReviewPayload, type ReviewSummary, type ReviewVerdict } from "../api";
import { tKey } from "../i18n";

export type ReviewState = ({ pending: true } | ({ pending: false } & ReviewSummary)) & { sessionId: number };

let latest: ReviewState | null = null;
const listeners = new Set<(r: ReviewState | null) => void>();

const publish = (r: ReviewState | null) => {
  latest = r;
  listeners.forEach((fn) => fn(r));
};

export const latestReview = () => latest;

export function onReview(fn: (r: ReviewState | null) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Beendet den Mitschnitt des Durchgangs und startet die Nachanalyse (sessionId null: nur beenden). */
export function finishReview(sessionId: number | null, payload: ReviewPayload | null) {
  const empty: ReviewPayload = { mode: "", toleranceMs: 0, items: [], liveHits: 0, liveMisses: 0 };
  if (sessionId === null || !payload || payload.items.length === 0) {
    void api.reviewFinish(null, payload ?? empty);
    return;
  }
  publish({ pending: true, sessionId });
  api.reviewFinish(sessionId, payload).then((r) => {
    if (latest?.sessionId !== sessionId) return; // inzwischen ein neuerer Durchgang
    publish(r.skipped ? null : { ...r, pending: false, sessionId });
  });
}

/** Neuer Durchgang: altes Ergebnis ausblenden. */
export const clearReview = () => publish(null);

/** Trefferquote in Prozent. */
export const percent = (hits: number, total: number) => (total > 0 ? Math.round((hits / total) * 100) : 0);

/** Zeitpunkt (Aufnahme-s) je erwarteter Note: gespielte Note, sonst Fälligkeit, sonst zwischen den
    Nachbarn eingeordnet (verpasste Noten im Warte-Modus). */
export function itemTimes(review: Pick<Review, "items" | "segments" | "durationSec">): number[] {
  const known = review.items.map((it) =>
    it.segment >= 0 ? review.segments[it.segment]?.start : it.timeSec);
  return known.map((t, i) => {
    if (t !== undefined) return t;
    let a = i - 1, b = i + 1;
    while (a >= 0 && known[a] === undefined) a--;
    while (b < known.length && known[b] === undefined) b++;
    const ta = a >= 0 ? known[a]! : 0;
    const tb = b < known.length ? known[b]! : review.durationSec;
    return ta + ((tb - ta) * (i - a)) / (b - a);
  });
}

/** Stellen, an denen Live-Wertung und Nachanalyse auseinanderliegen oder die nicht getroffen wurden. */
export const isDeviation = (it: ReviewItem) => it.verdict !== "hit" || it.live !== "hit";

export const VERDICT_NAMES: Record<ReviewVerdict, string> = {
  hit: tKey("Treffer|Wertung"), early: tKey("zu früh"), late: tKey("zu spät"), octave: tKey("falsche Oktave"), wrong: tKey("falscher Ton"), missed: tKey("nicht gespielt"),
};
