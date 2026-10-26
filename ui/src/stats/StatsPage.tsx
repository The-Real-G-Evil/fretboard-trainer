import { useEffect, useState } from "react";
import { api, noteName, type StatsData } from "../api";
import { Fretboard } from "../calibration/Fretboard";
import { Staff } from "../components/Staff";
import type { Instrument } from "../instruments";
import { clefById, type Clef } from "../music/notation";
import { statsByPitch, weightFor } from "../practice/adaptive";
import { difficultyById } from "../practice/engine";
import { tempoById } from "../practice/timed";
import { ReviewView } from "../practice/ReviewView";
import { percent } from "../practice/review";
import { locale, t, tCore } from "../i18n";

interface StatsPageProps {
  instrument: Instrument; // in der gewählten Stimmung
  clef: Clef | string;
}

/** Farbe für eine Trefferquote: rot (0 %) über gelb nach grün (100 %). */
export const rateColor = (rate: number) => `hsl(${Math.round(120 * Math.min(1, Math.max(0, rate)))} 55% 38%)`;

const name = (midi: number) => {
  const n = noteName(midi);
  return `${n.name}${n.octave}`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Zahl mit einer Nachkommastelle im Format der eingestellten Sprache. */
const dec1 = (v: number) => v.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const formatDuration = (sec: number) =>
  sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`
  : sec >= 60 ? `${Math.round(sec / 60)} min` : `${Math.round(sec)} s`;

function Bar({ value }: { value: number }) {
  const cls = value >= 0.9 ? "good" : value >= 0.7 ? "ok" : "bad";
  return (
    <span className="stat-bar">
      <span className={cls} style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

/** Übungsstatistik je Instrument: Überblick, schwache Töne, Verwechslungen, letzte Durchgänge. */
export function StatsPage({ instrument, clef }: StatsPageProps) {
  const [data, setData] = useState<StatsData | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);

  const load = () => api.getStats(instrument.id).then(setData);
  useEffect(() => {
    load();
  }, [instrument.id]);

  if (!data) return <section className="card wide-card"><p className="hint">{t("Statistik wird geladen …")}</p></section>;
  if (data.error) return <section className="card wide-card"><p className="error">{tCore(data.error)}</p></section>;

  const totalAttempts = data.notes.reduce((a, n) => a + n.attempts, 0);
  const totalHits = data.notes.reduce((a, n) => a + n.hits, 0);
  const totalTime = data.sessions.reduce((a, s) => a + s.durationSec, 0);
  const totalScore = data.sessions.reduce((a, s) => a + s.score, 0);

  const pitches = [...statsByPitch(data.notes).entries()]
    .map(([midi, s]) => ({ midi, ...s, rate: s.attempts > 0 ? s.hits / s.attempts : 0, weight: weightFor(s, "wait") }))
    .sort((a, b) => b.weight - a.weight);
  const totalWeight = pitches.reduce((a, p) => a + p.weight, 0);
  const byMidi = new Map(pitches.map((p) => [p.midi, p]));
  const levelByMidi = new Map((data.levels ?? []).map((l) => [l.midi, l]));
  const withLevels = levelByMidi.size > 0;
  const dev = (db: number) => `${db >= 0 ? "+" : "−"}${dec1(Math.abs(db))} dB`;
  const heat = (midi: number) => {
    const p = byMidi.get(midi);
    return p && p.attempts > 0
      ? { color: rateColor(p.rate), title: t("{note}: {pct} % von {n}", { note: name(midi), pct: Math.round(p.rate * 100), n: p.attempts }) }
      : undefined;
  };
  const staffNotes = [...byMidi.values()]
    .sort((a, b) => a.midi - b.midi)
    .map((p) => ({ midi: p.midi, state: "plain" as const, color: rateColor(p.rate), label: `${Math.round(p.rate * 100)}` }));

  if (data.sessions.length === 0)
    return (
      <section className="card wide-card">
        <h2>{t("Statistik")} · {instrument.name}</h2>
        <p className="hint">{t("Noch keine Übungsdurchgänge mit diesem Instrument. Nach dem ersten Üben erscheint hier deine Auswertung.")}</p>
      </section>
    );

  return (
    <>
      <section className="card wide-card">
        <h2>{t("Statistik")} · {instrument.name}</h2>
        <div className="result-stats">
          <div><span>{t("Durchgänge")}</span>{data.sessions.length}</div>
          <div><span>{t("Übungszeit")}</span>{formatDuration(totalTime)}</div>
          <div><span>{t("Gespielte Noten")}</span>{totalAttempts}</div>
          <div><span>{t("Trefferquote")}</span>{totalAttempts > 0 ? Math.round((totalHits / totalAttempts) * 100) : 0} %</div>
          <div className="accuracy good"><span>{t("Punkte gesamt")}</span>{totalScore}</div>
        </div>
      </section>

      <section className="card wide-card">
        <h2>{t("Heatmap Griffbrett")}</h2>
        <Fretboard instrument={instrument} notes={[]} states={[]} noteNames="full" fretCount={Math.min(instrument.frets, 12)} heat={heat} />
        <p className="hint">
          {t("Farbe = Trefferquote des Tons (rot → gelb → grün), grau = noch nicht geübt. Ein Ton zählt an allen Stellen, an denen er liegt; die Griffposition wird nur auf „Sehr leicht“ mitgeschrieben.")}
        </p>
      </section>

      {staffNotes.length > 0 && (
        <section className="card wide-card">
          <h2>{t("Heatmap Notensystem")}</h2>
          <div className="table-scroll heat-staff">
            <Staff clef={typeof clef === "string" ? clefById(clef) : clef} notes={staffNotes} lineGap={12} spacing={3.2} slots={staffNotes.length} />
          </div>
          <p className="hint">{t("Geübte Töne von tief nach hoch, darunter die Trefferquote in Prozent.")}</p>
        </section>
      )}

      <section className="card span2">
        <h2>{t("Töne · schwächste zuerst")}</h2>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr><th>{t("Ton")}</th><th>{t("Versuche")}</th><th>{t("Quote")}</th><th>{t("Ø Reaktion")}</th><th>{t("Ø Timing")}</th>{withLevels && <th title={t("Mittlere Abweichung vom Bezugspegel bei Treffern mit Lautstärke-Bewertung (+ = lauter)")}>{t("Ø Lautstärke")}</th>}<th>{t("Anteil adaptiv")}</th></tr>
          </thead>
          <tbody>
            {pitches.map((p) => (
              <tr key={p.midi}>
                <td className="note-name">{name(p.midi)}</td>
                <td>{p.attempts}</td>
                <td><Bar value={p.rate} /> {Math.round(p.rate * 100)} %</td>
                <td>{p.avgReactionMs > 0 ? `${(p.avgReactionMs / 1000).toFixed(2)} s` : "–"}</td>
                <td>{p.avgTimingAbsMs > 0 ? `±${Math.round(p.avgTimingAbsMs)} ms` : "–"}</td>
                {withLevels && <td>{levelByMidi.has(p.midi) ? dev(levelByMidi.get(p.midi)!.avgDevDb) : "–"}</td>}
                <td>{Math.round((p.weight / totalWeight) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="hint">{t("„Anteil adaptiv“: so oft kommt der Ton bei eingeschalteter adaptiver Auswahl dran (Warte-Modus).")}</p>
      </section>

      <section className="card">
        <h2>{t("Verwechslungen")}</h2>
        {data.confusions.length === 0 ? (
          <p className="hint">{t("Keine – sauber gespielt.")}</p>
        ) : (
          <ul className="confusions">
            {data.confusions.map((c) => (
              <li key={`${c.expectedMidi}-${c.playedMidi}`}>
                <span className="note-name">{name(c.expectedMidi)}</span> {t("gesucht,")} <span className="note-name">{name(c.playedMidi)}</span> {t("gespielt")}
                {(c.playedMidi - c.expectedMidi) % 12 === 0 && <span className="hint"> ({t("Oktave")})</span>}
                <span className="count">{c.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card wide-card">
        <h2>{t("Letzte Durchgänge")}</h2>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr><th>{t("Wann")}</th><th>{t("Stufe")}</th><th>{t("Modus")}</th><th>{t("Treffer")}</th><th>{t("Quote")}</th><th title={t("Quote nach der Nachanalyse der Aufnahme")}>{t("Endwert")}</th><th>Ø</th><th title={t("Anteil der Treffer im Lautstärke-Fenster und Streuung")}>{t("Lautstärke|Bewertung")}</th><th>{t("Punkte")}</th><th>{t("Dauer")}</th></tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => {
              const n = s.hits + s.misses;
              return (
                <tr key={s.id}>
                  <td>{formatDate(s.startedAt)}</td>
                  <td>{t(difficultyById(s.difficulty).name)}</td>
                  <td>
                    {s.mode === "timed" ? t("getaktet, {tempo} {bpm} BPM", { tempo: t(tempoById(s.tempo).name).split(" ")[0], bpm: Math.round(s.bpm) })
                      : s.mode === "songPlay" ? t("Lied mitspielen, {tempo}", { tempo: s.tempo })
                      : s.mode === "songWait" ? t("Lied wartet, {tempo}", { tempo: s.tempo })
                      : s.mode === "rhythm" ? t("Rhythmus, {tempo}", { tempo: s.tempo }) : t("warten")}
                    {s.source === "gp" && <span className="hint"> · {t("Lied „{name}“", { name: s.gpFile ?? "" })}</span>}
                    {s.source === "scale" && <span className="hint"> · {t("Tonleiter {name}", { name: s.gpFile ?? "" })}</span>}
                    {s.source === "course" && <span className="hint"> · {t("Kurs {name}", { name: s.gpFile ?? "" })}</span>}
                  </td>
                  <td>{s.hits}/{n}</td>
                  <td>{n > 0 ? Math.round((s.hits / n) * 100) : 0} %</td>
                  <td>
                    {s.finalHits !== undefined && s.finalTotal !== undefined ? (
                      <button className="link-button" onClick={() => setReviewId(reviewId === s.id ? null : s.id)} title={t("Review: Aufnahme mit Wertung je Note")}>
                        {percent(s.finalHits, s.finalTotal)} % ▸
                      </button>
                    ) : "–"}
                  </td>
                  <td>{s.mode === "timed" || s.mode === "songPlay" || s.mode === "rhythm" ? `±${Math.round(s.avgTimingAbsMs)} ms` : `${(s.avgReactionMs / 1000).toFixed(2)} s`}</td>
                  <td>
                    {s.dynamicsWindowDb !== undefined && s.levelRated
                      ? t("{pct} % in ±{win} dB (Streuung ±{spread})", { pct: Math.round((s.levelInWindowRate ?? 0) * 100), win: s.dynamicsWindowDb, spread: dec1(s.levelSpreadDb ?? 0) })
                      : "–"}
                  </td>
                  <td>{s.score}</td>
                  <td>{formatDuration(s.durationSec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      {reviewId !== null && (
        <section className="card wide-card">
          <h2>Review</h2>
          <ReviewView key={reviewId} sessionId={reviewId} onClose={() => setReviewId(null)} />
        </section>
      )}

      <section className="card wide-card stats-actions">
        {confirmClear ? (
          <>
            <span>{t("Alle Statistikdaten für {name} endgültig löschen?", { name: instrument.name })}</span>
            <button className="danger" onClick={async () => { await api.clearStats(instrument.id); setConfirmClear(false); load(); }}>
              {t("Ja, löschen")}
            </button>
            <button onClick={() => setConfirmClear(false)}>{t("Abbrechen")}</button>
          </>
        ) : (
          <button onClick={() => setConfirmClear(true)}>{t("Statistik für {name} löschen …", { name: instrument.name })}</button>
        )}
      </section>
    </>
  );
}
