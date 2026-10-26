import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Review, type ReviewItem } from "../api";
import { chordSymbol } from "./chords";
import { isDeviation, itemTimes, percent, VERDICT_NAMES } from "./review";
import { formatName } from "./WaitRun";
import { t } from "../i18n";

const PX_PER_SEC = 90;
const H = 150;
const WAVE_TOP = 26, WAVE_H = 80; // Wellenform; darüber die erwarteten, darunter die erkannten Noten

const expectedName = (it: ReviewItem) => (it.midis.length > 1 ? chordSymbol(it.midis) : formatName(it.midis[0]));

/** Review eines Durchgangs: Wellenform mit erwarteten Noten (Farbe = Nachanalyse) und erkannten Noten;
    jede Stelle lässt sich über das Audio-Interface anhören. */
export function ReviewView({ sessionId, onClose }: { sessionId: number; onClose?: () => void }) {
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [selected, setSelected] = useState<number | null>(null);
  const [onlyDeviations, setOnlyDeviations] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.getReview(sessionId).then((r) => alive && setReview(r));
    return () => {
      alive = false;
      void api.stopReview();
    };
  }, [sessionId]);

  const times = useMemo(() => (review ? itemTimes(review) : []), [review]);

  if (review === undefined) return <p className="hint">{t("Review wird geladen …")}</p>;
  if (review === null) return <p className="hint">{t("Für diesen Durchgang gibt es keine Aufnahme (mehr).")}</p>;

  const width = Math.max(600, Math.ceil(review.durationSec * PX_PER_SEC));
  const x = (sec: number) => sec * PX_PER_SEC;
  const extra = new Set(review.extra);

  const play = (i: number) => {
    setSelected(i);
    const it = review.items[i];
    const seg = it.segment >= 0 ? review.segments[it.segment] : null;
    const from = (seg?.start ?? times[i]) - 0.3;
    const to = (seg?.end ?? times[i] + 0.5) + 0.3;
    void api.playReview(sessionId, Math.max(0, from), to);
    // Stelle in der Wellenform sichtbar machen
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, x(times[i]) - el.clientWidth / 2), behavior: "smooth" });
  };
  const playSegment = (k: number) => {
    const s = review.segments[k];
    void api.playReview(sessionId, Math.max(0, s.start - 0.3), s.end + 0.3);
  };

  const rows = review.items.map((it, i) => ({ it, i })).filter(({ it }) => !onlyDeviations || isDeviation(it));

  return (
    <div className="review">
      <div className="review-head">
        <span>
          Live <strong>{review.liveHits}/{review.liveTotal}</strong> ({percent(review.liveHits, review.liveTotal)} %)
          {" → "}{t("Endwert")} <strong>{review.finalHits}/{review.finalTotal}</strong> ({percent(review.finalHits, review.finalTotal)} %)
        </span>
        <span className="hint">
          {t("{n} erwartete Noten · {extra} zusätzlich gespielt · {s} s", { n: review.items.length, extra: review.extra.length, s: review.durationSec.toFixed(0) })}
          {review.toleranceMs > 0 ? " · " + t("Fenster ±{ms} ms", { ms: Math.round(review.toleranceMs) }) : " · " + t("nur Reihenfolge bewertet")}
          {review.truncated && " · " + t("Aufnahme nach 10 min gekürzt")}
        </span>
        <span className="review-actions">
          <button onClick={() => void api.stopReview()}>■ {t("Stopp")}</button>
          {onClose && <button onClick={onClose}>{t("Schließen")}</button>}
        </span>
      </div>

      <div className="review-legend">
        <span className="v-hit">{t("Treffer")}</span><span className="v-timing">{t("zu früh/spät")}</span>
        <span className="v-wrong">{t("falsch/Oktave")}</span><span className="v-missed">{t("nicht gespielt")}</span>
        <span className="v-extra">{t("zusätzlich gespielt")}</span>
        <span className="hint">{t("Oben erwartet, unten erkannt – Klick spielt die Stelle ab.")}</span>
      </div>

      <div className="review-scroll" ref={scroller}>
        <svg width={width} height={H} className="review-wave">
          {review.peaks.map((p, k) => {
            const bx = (k / review.peaks.length) * width;
            const h = Math.max(1, p * WAVE_H);
            return <rect key={k} x={bx} y={WAVE_TOP + (WAVE_H - h) / 2} width={Math.max(1, width / review.peaks.length - 0.5)} height={h} className="wave" />;
          })}
          {Array.from({ length: Math.floor(review.durationSec) + 1 }, (_, s) => s).filter((s) => s % 5 === 0).map((s) => (
            <text key={s} x={x(s) + 2} y={H - 2} className="review-sec">{s} s</text>
          ))}
          {review.segments.map((s, k) => (
            <g key={`s${k}`} className={`review-seg ${extra.has(k) ? "extra" : ""}`} onClick={() => playSegment(k)}>
              <rect x={x(s.start)} y={WAVE_TOP + WAVE_H + 4} width={Math.max(3, x(s.end) - x(s.start))} height={14} rx={3} />
              <title>{formatName(s.midi)}{s.pick ? "" : " " + t("(gebunden)")} · {s.start.toFixed(2)} s</title>
            </g>
          ))}
          {review.items.map((it, i) => (
            <g key={`i${i}`} className={`review-item v-${it.verdict === "early" || it.verdict === "late" ? "timing" : it.verdict === "octave" ? "wrong" : it.verdict} ${selected === i ? "selected" : ""}`}
               onClick={() => play(i)}>
              <line x1={x(times[i])} x2={x(times[i])} y1={18} y2={WAVE_TOP + WAVE_H} />
              <circle cx={x(times[i])} cy={12} r={6} />
              <title>{expectedName(it)}: {t(VERDICT_NAMES[it.verdict])} {it.live === "hit" ? t("(live Treffer)") : t("(live Fehler)")}</title>
            </g>
          ))}
        </svg>
      </div>

      <label className="review-filter">
        <input type="checkbox" checked={onlyDeviations} onChange={(e) => setOnlyDeviations(e.target.checked)} />
        <span>{t("nur Fehler und abweichende Wertungen")}</span>
      </label>
      {rows.length === 0 ? (
        <p className="hint">{t("Keine Fehler – Live-Wertung und Nachanalyse stimmen überein.")}</p>
      ) : (
        <table className="review-table">
          <thead>
            <tr><th>#</th><th>{t("Erwartet")}</th><th>{t("Erkannt")}</th><th>Live</th><th>{t("Nachanalyse")}</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(({ it, i }) => {
              const seg = it.segment >= 0 ? review.segments[it.segment] : null;
              return (
                <tr key={i} className={selected === i ? "selected" : ""}>
                  <td>{i + 1}</td>
                  <td>{expectedName(it)}</td>
                  <td>{seg ? formatName(seg.midi) : "–"}{it.timingErrorMs !== undefined && seg ? ` · ${it.timingErrorMs > 0 ? "+" : ""}${Math.round(it.timingErrorMs)} ms` : ""}</td>
                  <td className={it.live === "hit" ? "ok" : "bad"}>{it.live === "hit" ? t("Treffer|Wertung") : t("Fehler|Wertung")}</td>
                  <td className={it.verdict === "hit" ? "ok" : "bad"}>{t(VERDICT_NAMES[it.verdict])}</td>
                  <td><button onClick={() => play(i)} title={t("Stelle anhören")}>▶</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
