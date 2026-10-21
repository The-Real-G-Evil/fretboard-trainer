import { useEffect, useState } from "react";
import { api, noteName, type StatsData } from "../api";
import { Fretboard } from "../calibration/Fretboard";
import { Staff } from "../components/Staff";
import type { Instrument } from "../instruments";
import { clefById, type Clef } from "../music/notation";
import { statsByPitch, weightFor } from "../practice/adaptive";
import { difficultyById } from "../practice/engine";
import { tempoById } from "../practice/timed";

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
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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

  const load = () => api.getStats(instrument.id).then(setData);
  useEffect(() => {
    load();
  }, [instrument.id]);

  if (!data) return <section className="card wide-card"><p className="hint">Statistik wird geladen …</p></section>;
  if (data.error) return <section className="card wide-card"><p className="error">{data.error}</p></section>;

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
  const dev = (db: number) => `${db >= 0 ? "+" : "−"}${Math.abs(db).toFixed(1).replace(".", ",")} dB`;
  const heat = (midi: number) => {
    const p = byMidi.get(midi);
    return p && p.attempts > 0
      ? { color: rateColor(p.rate), title: `${name(midi)}: ${Math.round(p.rate * 100)} % von ${p.attempts}` }
      : undefined;
  };
  const staffNotes = [...byMidi.values()]
    .sort((a, b) => a.midi - b.midi)
    .map((p) => ({ midi: p.midi, state: "plain" as const, color: rateColor(p.rate), label: `${Math.round(p.rate * 100)}` }));

  if (data.sessions.length === 0)
    return (
      <section className="card wide-card">
        <h2>Statistik · {instrument.name}</h2>
        <p className="hint">Noch keine Übungsdurchgänge mit diesem Instrument. Nach dem ersten Üben erscheint hier deine Auswertung.</p>
      </section>
    );

  return (
    <>
      <section className="card wide-card">
        <h2>Statistik · {instrument.name}</h2>
        <div className="result-stats">
          <div><span>Durchgänge</span>{data.sessions.length}</div>
          <div><span>Übungszeit</span>{formatDuration(totalTime)}</div>
          <div><span>Gespielte Noten</span>{totalAttempts}</div>
          <div><span>Trefferquote</span>{totalAttempts > 0 ? Math.round((totalHits / totalAttempts) * 100) : 0} %</div>
          <div className="accuracy good"><span>Punkte gesamt</span>{totalScore}</div>
        </div>
      </section>

      <section className="card wide-card">
        <h2>Heatmap Griffbrett</h2>
        <Fretboard instrument={instrument} notes={[]} states={[]} noteNames="full" fretCount={Math.min(instrument.frets, 12)} heat={heat} />
        <p className="hint">
          Farbe = Trefferquote des Tons (rot → gelb → grün), grau = noch nicht geübt. Ein Ton zählt an allen Stellen,
          an denen er liegt; die Griffposition wird nur auf „Sehr leicht“ mitgeschrieben.
        </p>
      </section>

      {staffNotes.length > 0 && (
        <section className="card wide-card">
          <h2>Heatmap Notensystem</h2>
          <div className="table-scroll heat-staff">
            <Staff clef={typeof clef === "string" ? clefById(clef) : clef} notes={staffNotes} lineGap={12} spacing={3.2} slots={staffNotes.length} />
          </div>
          <p className="hint">Geübte Töne von tief nach hoch, darunter die Trefferquote in Prozent.</p>
        </section>
      )}

      <section className="card span2">
        <h2>Töne · schwächste zuerst</h2>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr><th>Ton</th><th>Versuche</th><th>Quote</th><th>Ø Reaktion</th><th>Ø Timing</th>{withLevels && <th title="Mittlere Abweichung vom Bezugspegel bei Treffern mit Lautstärke-Bewertung (+ = lauter)">Ø Lautstärke</th>}<th>Anteil adaptiv</th></tr>
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
        <p className="hint">„Anteil adaptiv“: so oft kommt der Ton bei eingeschalteter adaptiver Auswahl dran (Warte-Modus).</p>
      </section>

      <section className="card">
        <h2>Verwechslungen</h2>
        {data.confusions.length === 0 ? (
          <p className="hint">Keine – sauber gespielt.</p>
        ) : (
          <ul className="confusions">
            {data.confusions.map((c) => (
              <li key={`${c.expectedMidi}-${c.playedMidi}`}>
                <span className="note-name">{name(c.expectedMidi)}</span> gesucht, <span className="note-name">{name(c.playedMidi)}</span> gespielt
                {(c.playedMidi - c.expectedMidi) % 12 === 0 && <span className="hint"> (Oktave)</span>}
                <span className="count">{c.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card wide-card">
        <h2>Letzte Durchgänge</h2>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr><th>Wann</th><th>Stufe</th><th>Modus</th><th>Treffer</th><th>Quote</th><th>Ø</th><th title="Anteil der Treffer im Lautstärke-Fenster und Streuung">Lautstärke</th><th>Punkte</th><th>Dauer</th></tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => {
              const n = s.hits + s.misses;
              return (
                <tr key={s.id}>
                  <td>{formatDate(s.startedAt)}</td>
                  <td>{difficultyById(s.difficulty).name}</td>
                  <td>
                    {s.mode === "timed" ? `getaktet, ${tempoById(s.tempo).name.split(" ")[0]} ${Math.round(s.bpm)} BPM` : "warten"}
                    {s.source === "gp" && <span className="hint"> · Lied „{s.gpFile}“</span>}
                  </td>
                  <td>{s.hits}/{n}</td>
                  <td>{n > 0 ? Math.round((s.hits / n) * 100) : 0} %</td>
                  <td>{s.mode === "timed" ? `±${Math.round(s.avgTimingAbsMs)} ms` : `${(s.avgReactionMs / 1000).toFixed(2)} s`}</td>
                  <td>
                    {s.dynamicsWindowDb !== undefined && s.levelRated
                      ? `${Math.round((s.levelInWindowRate ?? 0) * 100)} % in ±${s.dynamicsWindowDb} dB (Streuung ±${(s.levelSpreadDb ?? 0).toFixed(1).replace(".", ",")})`
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

      <section className="card wide-card stats-actions">
        {confirmClear ? (
          <>
            <span>Alle Statistikdaten für {instrument.name} endgültig löschen?</span>
            <button className="danger" onClick={async () => { await api.clearStats(instrument.id); setConfirmClear(false); load(); }}>
              Ja, löschen
            </button>
            <button onClick={() => setConfirmClear(false)}>Abbrechen</button>
          </>
        ) : (
          <button onClick={() => setConfirmClear(true)}>Statistik für {instrument.name} löschen …</button>
        )}
      </section>
    </>
  );
}
