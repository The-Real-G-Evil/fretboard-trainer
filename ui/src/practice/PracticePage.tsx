import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { adaptiveWeights } from "./adaptive";
import { Staff } from "../components/Staff";
import type { Instrument } from "../instruments";
import { clefById } from "../music/notation";
import { DIFFICULTIES, difficultyById, type Difficulty } from "./engine";
import { candidatePitches, randomSource, sequenceSource, weighted, type Random, type Target } from "./generator";
import { SongPanel, useSong } from "./SongPanel";
import { songBpm, songTargets, suggestTrack, TEMPO_PERCENTS, type SongSettings } from "../song/songPractice";
import type { Extraction } from "../song/gpImport";
import { PracticeSettings } from "./PracticeSettings";
import type { InstrumentPractice } from "./settings";
import { TEMPOS, tempoById, type TempoId } from "./timed";
import { TimedRun } from "./TimedRun";
import { DIAGNOSTIC_MAX_SEC, finishDiagnostic, startDiagnostic } from "./diagnostics";
import { DYNAMICS_WINDOWS, narrowedWindow, type DynamicsSummary } from "./dynamics";
import { isSongMode, MODE_CHOICES, playMode, type ModeChoice, type TimingSettings } from "./timing";
import { WaitRun } from "./WaitRun";

/** „Sehr schwer“: so oft folgt auf eine angeschlagene Note eine gebundene (Hammer-on/Pull-off). */
const LEGATO_CHANCE = 0.25;

// Song-Modus mit alphaTab-Notenansicht und Wiedergabe: erst bei Bedarf laden
const SongRun = lazy(() => import("./SongRun"));

/** Fehler im Song-Modus anzeigen statt die ganze Seite zu verlieren. */
class SongErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error
      ? <section className="card wide-card"><p className="bad">Song-Modus nicht möglich: {this.state.error}</p></section>
      : this.props.children;
  }
}

interface PracticePageProps {
  instrument: Instrument; // Vorlage (Standardstimmung)
  tuned: Instrument; // in der gewählten Stimmung
  practice: InstrumentPractice;
  difficulty: Difficulty;
  timing: TimingSettings;
  centsTolerance: number;
  onPracticeChange: (p: InstrumentPractice) => void;
  onDifficultyChange: (d: Difficulty) => void;
  onTimingChange: (t: TimingSettings) => void;
  song: SongSettings;
  onSongChange: (s: SongSettings) => void;
}

export function PracticePage({
  instrument, tuned, practice, difficulty, timing, centsTolerance, onPracticeChange, onDifficultyChange, onTimingChange,
  song, onSongChange,
}: PracticePageProps) {
  const [run, setRun] = useState(0); // 0 = keine Übung; jeder Start bekommt eine neue Nummer
  const [random, setRandom] = useState<Random>(() => () => Math.random());
  const [showSettings, setShowSettings] = useState(false);

  const level = difficultyById(difficulty);
  const clef = clefById(practice.clef);
  const fromSong = song.source === "song";
  const mode = playMode(timing.mode, difficulty, fromSong);
  const songMode = mode === "songPlay" || mode === "songWait";
  // Nach Werten vergleichen: die Einstellungen kommen bei jedem Rendern als neue Objekte an
  const rangeKey = `${practice.range.strings.join("-")}/${practice.range.frets.join("-")}`;
  const randomPitches = useMemo(() => candidatePitches(tuned, practice.range, level.naturalsOnly), [tuned, rangeKey, level.naturalsOnly]);

  // Notenquelle Lied: Tonfolge der gewählten Spur im Taktbereich
  const loaded = useSong(fromSong ? song.path : "");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  useEffect(() => {
    const score = loaded.song?.score;
    if (!score) return void setExtraction(null);
    import("../song/gpImport").then((gp) => setExtraction(gp.extractNotes(score, song.track)));
  }, [loaded.song, song.track]);
  // Spur passend zum Instrument: nach dem Laden, wenn noch keine gewählt ist, und beim Instrumentwechsel,
  // wenn die gewählte Spur nicht zur Saitenzahl passt (eine bewusst gewählte passende Spur bleibt)
  useEffect(() => {
    const info = loaded.song?.info;
    if (!info) return;
    const current = info.tracks[song.track];
    if (song.track >= 0 && current && current.tuning.length === tuned.strings.length) return;
    const best = suggestTrack(info.tracks, tuned);
    if (best >= 0 && best !== song.track) onSongChange({ ...song, track: best });
  }, [loaded.song, instrument.id]);
  const songTrackTuning = loaded.song?.info.tracks[song.track]?.tuning ?? [];
  const tuningKey = tuned.strings.map((s) => s.midi).join(",");
  const fromSongTargets = useMemo(
    () => (extraction ? songTargets(extraction.notes, songTrackTuning, tuned, song.barFrom, song.barTo) : null),
    [extraction, tuningKey, song.barFrom, song.barTo],
  );
  const songPitches = useMemo(() => {
    const m = new Map<number, Target[]>();
    for (const t of fromSongTargets?.targets ?? []) m.set(t.midi, [...(m.get(t.midi) ?? []), t]);
    return m;
  }, [fromSongTargets]);

  const pitches = fromSong ? songPitches : randomPitches;
  const source = useMemo(
    () => (fromSong ? sequenceSource(fromSongTargets?.targets ?? [], song.loop)
                    : randomSource(pitches, random, level.legato ? LEGATO_CHANCE : 0)),
    [fromSong, fromSongTargets, song.loop, pitches, random, level.legato],
  );
  // Lied: Dateiname als Schlüssel in der Statistik, Titel zur Anzeige
  const songName = fromSong ? loaded.song?.name : undefined;
  const songTitle = fromSong ? loaded.song?.info.title || loaded.song?.name : undefined;

  // Getaktet im Liedtempo (am Anfang des Taktbereichs, skaliert) statt mit eigenem BPM
  const liveBpm = fromSong && song.songTempo && loaded.song ? songBpm(loaded.song.info.tempos, song.barFrom, song.tempoPercent) : null;
  const runTiming = liveBpm !== null ? { ...timing, bpm: liveBpm } : timing;

  // Geänderte Einstellungen beenden eine laufende Übung
  // (Im Song-Modus wechselt das Mischpult die Spur, ohne die Wiedergabe anzuhalten: SongRun bleibt bestehen.)
  useEffect(() => setRun(0), [songMode ? null : pitches, fromSong, songMode ? null : fromSongTargets,
    songMode ? null : song.barFrom, songMode ? null : song.barTo, songMode ? null : song.loop, difficulty, practice.clef, mode,
    // Song-Modus: eigenes Tempo (Prozent vom Liedtempo); Tempo/BPM des getakteten Modus spielen dort keine Rolle
    songMode ? null : timing.tempo, songMode ? null : runTiming.bpm, timing.dynamics, timing.dynamicsWindowDb,
    song.tempoPercent, song.path]);

  const start = async () => {
    let r: Random = () => Math.random();
    if (timing.adaptive && !fromSong) {
      const stats = await api.getStats(tuned.id);
      if (!stats.error) r = weighted(Math.random, adaptiveWeights(pitches.keys(), stats.notes, mode));
    }
    setRandom(() => r);
    setNarrowed(null);
    setRun((n) => n + 1);
    setShowSettings(false);
  };
  const setTiming = (patch: Partial<TimingSettings>) => onTimingChange({ ...timing, ...patch });

  // Lautstärke-Fenster nach einem guten Durchgang automatisch enger (aktuelle Einstellungen, nicht die beim Start)
  const timingRef = useRef(timing);
  timingRef.current = timing;
  const [narrowed, setNarrowed] = useState<number | null>(null);
  const onDynamicsDone = (s: DynamicsSummary) => {
    const t = timingRef.current;
    if (!t.dynamicsAuto || t.dynamicsWindowDb !== s.windowDb) return;
    const w = narrowedWindow(s);
    if (w === s.windowDb) return;
    onTimingChange({ ...t, dynamicsWindowDb: w });
    setNarrowed(w);
  };
  const dynamics = { on: timing.dynamics, windowDb: timing.dynamicsWindowDb, onDone: onDynamicsDone };

  // Diagnose-Aufnahme je Durchgang (Einstellung beim Start zählt)
  const [diagnostic, setDiagnostic] = useState<{ path?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!run || !timing.diagnose) return;
    setDiagnostic(null);
    startDiagnostic({
      instrument: tuned.id,
      strings: tuned.strings.map((s) => s.midi),
      song: songName,
      range: practice.range,
      difficulty,
      mode,
      tempo: timing.tempo,
      bpm: runTiming.bpm,
      startedAt: new Date().toISOString(),
    });
    return () => void finishDiagnostic().then((r) => r && setDiagnostic(r));
  }, [run]);

  return (
    <>
      <section className="card wide-card practice-head">
        <div className="segmented" role="radiogroup" aria-label="Schwierigkeitsgrad">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} role="radio" aria-checked={d.id === difficulty} onClick={() => onDifficultyChange(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Notenquelle">
          {([["random", "Zufall"], ["song", "Lied"]] as const).map(([id, name]) => (
            <button key={id} role="radio" aria-checked={song.source === id} onClick={() => onSongChange({ ...song, source: id })}>
              {name}
            </button>
          ))}
        </div>
        <span className="hint">{tuned.name} · {clef.name}{songTitle ? ` · ${songTitle}` : ""}</span>
        <div className="practice-actions">
          <button onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>Übungsbereich & Stimmung</button>
          {run ? <button onClick={() => setRun(0)}>Beenden</button>
               : <button className="primary" onClick={start} disabled={pitches.size === 0 || (songMode && !loaded.song)}>Start</button>}
        </div>

        <div className="practice-timing">
          {!fromSong && (
            <label title="Töne, die dir schwerfallen oder die du lange nicht geübt hast, kommen öfter dran.">
              <input type="checkbox" checked={timing.adaptive} onChange={(e) => setTiming({ adaptive: e.target.checked })} />
              <span>Adaptiv</span>
            </label>
          )}
          <label title={`Nimmt jeden Durchgang (bis ${DIAGNOSTIC_MAX_SEC / 60} min) mit allen erkannten Tönen auf, um Fehlerkennungen zu untersuchen. Gespeichert unter Dokumente/Fretboard Trainer/Diagnose.`}>
            <input type="checkbox" checked={timing.diagnose} onChange={(e) => setTiming({ diagnose: e.target.checked })} />
            <span>Diagnose-Aufnahme</span>
          </label>
          <label title="Bewertet, wie gleichmäßig laut deine Treffer sind – gemessen an deinen letzten Treffern. Außerhalb des Fensters gibt es weniger Punkte, aber keinen Fehler.">
            <input type="checkbox" checked={timing.dynamics} onChange={(e) => setTiming({ dynamics: e.target.checked })} />
            <span>Lautstärke bewerten</span>
          </label>
          {timing.dynamics && (
            <>
              <label>
                <span>Fenster</span>
                <select value={timing.dynamicsWindowDb} onChange={(e) => setTiming({ dynamicsWindowDb: Number(e.target.value) })}>
                  {DYNAMICS_WINDOWS.map((w) => <option key={w} value={w}>±{w} dB</option>)}
                </select>
              </label>
              <label title="Nach einem Durchgang mit mindestens 20 bewerteten Treffern, davon 80 % im Fenster, wird das Fenster enger.">
                <input type="checkbox" checked={timing.dynamicsAuto} onChange={(e) => setTiming({ dynamicsAuto: e.target.checked })} />
                <span>automatisch enger</span>
              </label>
            </>
          )}
          <label>
            <span>Spielmodus</span>
            <select value={timing.mode} onChange={(e) => setTiming({ mode: e.target.value as ModeChoice })}>
              {MODE_CHOICES.filter((m) => fromSong || !isSongMode(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === "auto" ? `Nach Stufe (${mode === "timed" ? "getaktet" : "warten"})` : m.name}
                </option>
              ))}
            </select>
          </label>
          {songMode && (
            <>
              <label title="Wiedergabetempo, bezogen auf das Tempo im Lied">
                <span>Tempo</span>
                <select value={song.tempoPercent} onChange={(e) => onSongChange({ ...song, tempoPercent: Number(e.target.value) })}>
                  {TEMPO_PERCENTS.map((p) => <option key={p} value={p}>{p} %</option>)}
                </select>
              </label>
              <label>
                <input type="checkbox" checked={song.metronome} onChange={(e) => onSongChange({ ...song, metronome: e.target.checked })} />
                <span>Metronom</span>
              </label>
              <label title="Lautstärke von Metronom und Vorzähler (wirkt sofort)">
                <input type="range" min={-40} max={0} step={1} value={timing.volumeDb} aria-label="Metronom-Lautstärke"
                       onChange={(e) => setTiming({ volumeDb: Number(e.target.value) })} />
                <span className="hint">{timing.volumeDb} dB</span>
              </label>
              {mode === "songPlay" && (
                <label title="Wenn Treffer durchweg als „zu früh“ oder „zu spät“ gewertet werden, hier ausgleichen.">
                  <span>Timing-Ausgleich</span>
                  <input type="number" min={-300} max={300} step={5} value={timing.offsetMs}
                         onChange={(e) => setTiming({ offsetMs: Math.min(300, Math.max(-300, Number(e.target.value) || 0)) })} />
                  <span className="hint">ms</span>
                </label>
              )}
            </>
          )}
          {mode === "timed" && (
            <>
              <label>
                <span>Tempo</span>
                <select value={timing.tempo} onChange={(e) => setTiming({ tempo: e.target.value as TempoId })}>
                  {TEMPOS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              {fromSong && (
                <label title="Metronom im Tempo des Lieds (am Anfang des gewählten Taktbereichs).">
                  <input type="checkbox" checked={song.songTempo} onChange={(e) => onSongChange({ ...song, songTempo: e.target.checked })} />
                  <span>Liedtempo</span>
                </label>
              )}
              {liveBpm !== null ? (
                <label>
                  <select aria-label="Anteil am Liedtempo" value={song.tempoPercent}
                          onChange={(e) => onSongChange({ ...song, tempoPercent: Number(e.target.value) })}>
                    {TEMPO_PERCENTS.map((p) => <option key={p} value={p}>{p} %</option>)}
                  </select>
                  <span className="hint">= {liveBpm} BPM</span>
                </label>
              ) : (
                <label>
                  <span>BPM</span>
                  <input type="number" min={30} max={220} value={timing.bpm}
                         onChange={(e) => setTiming({ bpm: Math.min(220, Math.max(30, Number(e.target.value) || 30)) })} />
                </label>
              )}
              <label>
                <span>Metronom</span>
                <input type="range" min={-40} max={0} step={1} value={timing.volumeDb}
                       onChange={(e) => setTiming({ volumeDb: Number(e.target.value) })} />
              </label>
              <label title="Wenn Treffer durchweg als „zu spät“ gewertet werden, obwohl du auf den Klick spielst, hier ausgleichen.">
                <span>Timing-Ausgleich</span>
                <input type="number" min={-300} max={300} step={5} value={timing.offsetMs}
                       onChange={(e) => setTiming({ offsetMs: Math.min(300, Math.max(-300, Number(e.target.value) || 0)) })} />
                <span className="hint">ms</span>
              </label>
            </>
          )}
        </div>
      </section>

      {fromSong && !run && (
        <section className="card wide-card">
          <h2>Lied</h2>
          <SongPanel instrument={instrument} tuned={tuned} practice={practice} song={song} loaded={loaded}
                     targets={fromSongTargets} skippedChords={extraction?.skippedChords ?? 0}
                     onSongChange={onSongChange} onPracticeChange={onPracticeChange} />
        </section>
      )}

      {narrowed !== null && !run && (
        <p className="hint diagnostic-result">
          Gleichmäßig gespielt – das Lautstärke-Fenster ist jetzt ±{narrowed} dB.
        </p>
      )}

      {diagnostic && !run && (
        <p className={`hint diagnostic-result ${diagnostic.error ? "bad" : ""}`}>
          {diagnostic.error ? `Diagnose-Aufnahme nicht gespeichert: ${diagnostic.error}`
                            : `Diagnose-Aufnahme gespeichert: ${diagnostic.path}`}
        </p>
      )}

      {showSettings && (
        <section className="card wide-card">
          <h2>Übungsbereich & Stimmung · {instrument.name}</h2>
          <PracticeSettings instrument={instrument} practice={practice} onChange={onPracticeChange} />
        </section>
      )}

      {!run && (
        <section className="card wide-card practice-stage">
          <div className="practice-idle">
            <Staff clef={clef} notes={[]} sizeFor={pitches.keys()} />
            {songMode ? (
              <p>
                {mode === "songPlay"
                  ? "Das Lied läuft mit allen Spuren im gewählten Tempo, Noten und Tabulatur deiner Spur laufen mit. Nach dem Vorzähler spielst du mit; jede Note wird mit ihrer echten Länge im Zeitfenster bewertet."
                  : "Das Lied läuft, bis die nächste Note deiner Spur dran ist, und wartet dann, bis du sie spielst – so übst du Stellen im eigenen Tempo."}
                {!loaded.song && " Wähle zuerst ein Lied."}
              </p>
            ) : mode === "wait" ? (
              <p>
                Spiel die angezeigte Note. Die nächste erscheint erst, wenn der richtige Ton erkannt wurde – die Oktave muss stimmen.
                {level.showFretboard && " Auf dem Griffbrett siehst du, wo der Ton liegt und mit welchem Finger du greifst."}
                {!level.showFretboard && level.showNoteChart && " Das Griffbrett zeigt alle Tonnamen als Nachschlagehilfe."}
                {!level.showName && " Notennamen werden auf dieser Stufe nicht angezeigt."}
              </p>
            ) : (
              <p>
                Nach vier Schlägen Vorzähler fällt jede Note auf einen Schlag ({tempoById(timing.tempo).name}, {runTiming.bpm} BPM).
                Gewertet wird innerhalb von ±¼ Schlag; je genauer, desto mehr Punkte. Die Zeitleiste zeigt, wann die
                nächste Note fällig ist.
              </p>
            )}
            <button className="primary" onClick={start} disabled={pitches.size === 0 || (songMode && !loaded.song)}>Übung starten</button>
          </div>
        </section>
      )}

      {run > 0 && songMode && loaded.song && (
        <SongErrorBoundary key={run}>
          <Suspense fallback={<section className="card wide-card"><p className="hint">Song-Modus wird geladen …</p></section>}>
            <SongRun mode={mode} song={loaded.song} settings={song} tuned={tuned} difficulty={difficulty}
                     timing={timing} dynamics={dynamics} onSongChange={onSongChange} />
          </Suspense>
        </SongErrorBoundary>
      )}
      {run > 0 && mode === "wait" && (
        <WaitRun key={run} tuned={tuned} practice={practice} clef={clef} level={level} difficulty={difficulty}
                 pitches={pitches} centsTolerance={centsTolerance} source={source} dynamics={dynamics} songName={songName} songTrack={song.track} />
      )}
      {run > 0 && mode === "timed" && (
        <TimedRun key={run} tuned={tuned} practice={practice} clef={clef} level={level} difficulty={difficulty}
                  pitches={pitches} timing={runTiming} source={source} dynamics={dynamics} songName={songName} songTrack={song.track} />
      )}
    </>
  );
}
