import { useEffect, useRef, useState } from "react";
import type { NoteEvent } from "../api";
import { DynamicsMeter, dec1, formatDeviation, type DynamicsSummary, type LevelRating } from "./dynamics";
import { t } from "../i18n";

export interface DynamicsOptions {
  on: boolean;
  windowDb: number;
  onDone?: (s: DynamicsSummary) => void; // am Ende des Durchgangs (nur wenn bewertet wurde)
}

/** Lautstärke-Bewertung eines Durchgangs: bewertet Treffer und hält Rückmeldung und Bilanz. */
export function useDynamics({ on, windowDb, onDone }: DynamicsOptions) {
  const meter = useRef(new DynamicsMeter(windowDb));
  const [last, setLast] = useState<LevelRating | null>(null);
  const [summary, setSummary] = useState<DynamicsSummary>(() => meter.current.summary());
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => () => {
    const s = meter.current.summary();
    if (on && s.rated > 0) done.current?.(s);
  }, []);

  return {
    on,
    windowDb,
    last,
    summary,
    /** Bewertung, falls der Ton der Zielton ist (sonst undefined). */
    rate: (note: NoteEvent, targetMidi: number | undefined) =>
      on && note.midi === targetMidi ? meter.current.rate(note.levelDb) : undefined,
    /** Treffer übernehmen. */
    hit: (note: NoteEvent, rating: LevelRating | undefined) => {
      if (!on) return;
      meter.current.addHit(note.levelDb, rating);
      setLast(rating ?? null);
      setSummary(meter.current.summary());
    },
  };
}

/** Rückmeldung zum letzten Treffer: Abweichung und Lage im Fenster. */
export function LevelBadge({ rating, windowDb }: { rating: LevelRating | null; windowDb: number }) {
  if (!rating) return null;
  const range = Math.max(windowDb * 2, 12); // Skala ± range dB
  const W = 90, H = 10;
  const x = (db: number) => W / 2 + (Math.max(-range, Math.min(range, db)) / range) * (W / 2 - 3);
  const word = rating.inWindow ? t("gleichmäßig") : rating.deviationDb > 0 ? t("zu laut") : t("zu leise");
  return (
    <span className={`level-badge ${rating.inWindow ? "in" : "out"}`} title={t("Lautstärke gegenüber deinen letzten Treffern, Fenster ±{db} dB", { db: windowDb })}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={0} y={3} width={W} height={4} rx={2} className="lb-track" />
        <rect x={x(-windowDb)} y={1} width={x(windowDb) - x(-windowDb)} height={8} rx={2} className="lb-window" />
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} className="lb-center" />
        <circle cx={x(rating.deviationDb)} cy={H / 2} r={3.5} className="lb-mark" />
      </svg>
      {formatDeviation(rating)} {word}
    </span>
  );
}

/** Bilanz im Ergebnisfeld. */
export function DynamicsStats({ summary }: { summary: DynamicsSummary }) {
  return (
    <>
      <div title={t("Treffer innerhalb ±{db} dB um deine letzten Treffer", { db: summary.windowDb })}>
        <span>{t("Lautstärke ±{db} dB", { db: summary.windowDb })}</span>
        {summary.rated > 0 ? `${Math.round(summary.inWindowRate * 100)} %` : "–"}
      </div>
      <div title={t("Mittlere Abweichung der Lautstärke (quadratisch gemittelt)")}>
        <span>{t("Streuung")}</span>
        {summary.rated > 0 ? `±${dec1(summary.spreadDb)} dB` : "–"}
      </div>
    </>
  );
}
