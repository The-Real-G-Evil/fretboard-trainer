import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { adaptiveWeights } from "./adaptive";
import { Staff } from "../components/Staff";
import type { Instrument } from "../instruments";
import { clefById } from "../music/notation";
import { DIFFICULTIES, difficultyById, type Difficulty } from "./engine";
import { candidatePitches, randomSource, sequenceSource, weighted, type Random, type Target } from "./generator";
import { SongPanel, useSong } from "./SongPanel";
import { ScalePanel, type ScaleSettings } from "./ScalePanel";
import { scaleById, scaleLabel, scalePositions, scaleRandomSource, scaleTargets } from "../music/scales";
import { songBpm, songTargets, suggestTrack, type SongSettings } from "../song/songPractice";
import { TempoControl } from "./TempoControl";
import { fromSongSettings, RHYTHM_BARS, rhythmSongSettings, type RhythmSettings } from "./rhythmSettings";
import { RHYTHM_LEVELS, rhythmExercise } from "../song/rhythm";
import type { LoadedSong } from "./SongPanel";
import { CourseBanner } from "../courses/CourseBanner";
import { exerciseKey, type CourseModule, type ModuleExercise } from "../courses/modules";
import type { Extraction } from "../song/gpImport";
import { PracticeSettings } from "./PracticeSettings";
import type { InstrumentPractice } from "./settings";
import { TEMPOS, tempoById, type TempoId } from "./timed";
import { TimedRun } from "./TimedRun";
import { DIAGNOSTIC_MAX_SEC, finishDiagnostic, startDiagnostic } from "./diagnostics";
import { DYNAMICS_WINDOWS, narrowedWindow, type DynamicsSummary } from "./dynamics";
import { MODE_CHOICES, modeAvailable, playMode, type ModeChoice, type TimingSettings } from "./timing";
import { WaitRun } from "./WaitRun";
import { latestReview, onReview, percent, type ReviewState } from "./review";
import { ReviewView } from "./ReviewView";
import { t, tCore } from "../i18n";

/** Stufe „Hammer-ons und Pull-offs“: so oft folgt auf eine angeschlagene Note eine gebundene (Hammer-on/Pull-off). */
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
      ? <section className="card wide-card"><p className="bad">{t("Song-Modus nicht möglich: {error}", { error: this.state.error })}</p></section>
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
  scale: ScaleSettings;
  onScaleChange: (s: ScaleSettings) => void;
  rhythm: RhythmSettings;
  onRhythmChange: (r: RhythmSettings) => void;
  course?: { module: CourseModule; exercise: ModuleExercise } | null; // gerade geübte Kursübung
  onCourseStep?: (delta: number) => void;
  onOpenCourses?: () => void;
  autoStart?: number; // erhöht = Übung sofort starten, sobald sie geladen ist (Kurs: „Üben“, „Nächste“)
}

export function PracticePage({
  instrument, tuned, practice, difficulty, timing, centsTolerance, onPracticeChange, onDifficultyChange, onTimingChange,
  song, onSongChange, scale, onScaleChange, rhythm, onRhythmChange, course, onCourseStep, onOpenCourses, autoStart = 0,
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

  // Notenquelle Tonleiter: Leitertöne im Übungsbereich, der Reihe nach (mit Griffstellen in einer Lage) oder zufällig
  const fromScale = song.source === "scale";
  const scaleType = scaleById(scale.scale);
  const scaleOrdered = scale.order !== "random";
  const scalePos = useMemo(
    () => scalePositions(tuned, practice.range, scale.root, scaleType), [tuned, rangeKey, scale.root, scaleType]);
  const scaleSeq = useMemo(
    () => (scaleOrdered ? scaleTargets(scalePos, scale.root, scaleType, scale.octaves, scale.order, scale.loop) : []),
    [scalePos, scale.octaves, scale.order, scale.loop],
  );
  const scaleName = fromScale ? scaleLabel(scale.root, scaleType) : undefined;

  const pitches = fromSong ? songPitches : fromScale ? scalePos : randomPitches;
  const source = useMemo(
    () => (fromSong ? sequenceSource(fromSongTargets?.targets ?? [], song.loop)
         : fromScale ? (scaleOrdered ? sequenceSource(scaleSeq, scale.loop) : scaleRandomSource(pitches, random, scale.root, scaleType))
         : randomSource(pitches, random, level.legato ? LEGATO_CHANCE : 0)),
    [fromSong, fromSongTargets, song.loop, fromScale, scaleOrdered, scaleSeq, scale.loop, scale.root, scaleType, pitches, random, level.legato],
  );
  const canStart = pitches.size > 0 && !(fromScale && scaleOrdered && scaleSeq.length === 0);

  // Rhythmus: je Durchgang eine neue Übung aus der Notenquelle, gespielt wie ein Lied
  const rhythmMode = mode === "rhythm";
  const [rhythmRun, setRhythmRun] = useState<{ song: LoadedSong; settings: SongSettings } | null>(null);
  useEffect(() => {
    if (!run || !rhythmMode) return void setRhythmRun(null);
    let alive = true;
    import("../song/gpImport").then((gp) => {
      if (!alive) return;
      const title = scaleName ? `${t("Rhythmus")} · ${scaleName}` : t("Rhythmus-Übung");
      const { tex } = rhythmExercise(tuned, source, random, { bars: rhythm.bars, level: rhythm.level, bpm: timing.bpm, title });
      const score = gp.parseAlphaTex(tex);
      const path = `rhythm:${run}`;
      setRhythmRun({ song: { path, name: title, score, info: gp.songInfo(score) }, settings: rhythmSongSettings(song, rhythm, path, title) });
    });
    return () => void (alive = false);
  }, [run]);
  // Lied: Dateiname als Schlüssel in der Statistik, Titel zur Anzeige
  const songName = fromSong ? loaded.song?.name : undefined;
  const songTitle = fromSong ? loaded.song?.info.title || loaded.song?.name : undefined;

  // Getaktet im Liedtempo (am Anfang des Taktbereichs, skaliert) statt mit eigenem BPM
  const liveBpm = fromSong && song.songTempo && loaded.song ? songBpm(loaded.song.info.tempos, song.barFrom, song.tempoPercent) : null;
  const runTiming = liveBpm !== null ? { ...timing, bpm: liveBpm } : timing;

  // Geänderte Einstellungen beenden eine laufende Übung
  // (Im Song-Modus wechselt das Mischpult die Spur, ohne die Wiedergabe anzuhalten: SongRun bleibt bestehen.)
  useEffect(() => setRun(0), [songMode ? null : pitches, fromSong, fromScale, scaleSeq, scale.order, songMode ? null : fromSongTargets,
    songMode ? null : song.barFrom, songMode ? null : song.barTo, songMode ? null : song.loop, difficulty, practice.clef, mode,
    // Song-Modus: eigenes Tempo (Prozent vom Liedtempo); Tempo/BPM des getakteten Modus spielen dort keine Rolle
    songMode ? null : timing.tempo, songMode ? null : runTiming.bpm, timing.dynamics, timing.dynamicsWindowDb,
    rhythm.level, rhythm.bars,
    songMode ? null : song.tempoPercent, song.path]);

  const start = async () => {
    let r: Random = () => Math.random();
    if (timing.adaptive && !fromSong && !(fromScale && scaleOrdered)) {
      const stats = await api.getStats(tuned.id);
      if (!stats.error) r = weighted(Math.random, adaptiveWeights(pitches.keys(), stats.notes, mode));
    }
    setRandom(() => r);
    setNarrowed(null);
    setRun((n) => n + 1);
    setShowSettings(false);
  };
  const setTiming = (patch: Partial<TimingSettings>) => onTimingChange({ ...timing, ...patch });

  // Kursübung: gleich loslegen, sobald die Übungsdatei geladen und spielbar ist
  const autoStarted = useRef(0);
  const readyToStart = canStart && (!fromSong || loaded.song?.path === song.path) && !(songMode && !loaded.song);
  useEffect(() => {
    if (autoStart === autoStarted.current || !readyToStart) return;
    autoStarted.current = autoStart;
    void start();
  }, [autoStart, readyToStart]);

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

  // Nachanalyse des letzten Durchgangs (läuft nach dessen Ende im Kern)
  const [review, setReview] = useState<ReviewState | null>(latestReview);
  const [showReview, setShowReview] = useState(false);
  useEffect(() => onReview((r) => {
    setReview(r);
    setShowReview(false);
  }), []);

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

  const courseKey = course && fromSong ? exerciseKey(course.module, course.exercise) : undefined;

  return (
    <>
      {course && fromSong && (
        <CourseBanner module={course.module} exercise={course.exercise}
                      onStep={(d) => onCourseStep?.(d)} onOverview={() => onOpenCourses?.()} />
      )}
      {/* Kursübung: Stufe, Quelle, Spielmodus und Tempo gibt der Kurs vor – der Kasten entfällt */}
      {!courseKey && (
        <>
          <section className="card wide-card practice-head">
            <div className="segmented" role="radiogroup" aria-label={t("Schwierigkeitsgrad")}>
              {DIFFICULTIES.map((d) => (
                <button key={d.id} role="radio" aria-checked={d.id === difficulty} onClick={() => onDifficultyChange(d.id)}>
                  {t(d.name)}
                </button>
              ))}
            </div>
            <div className="segmented" role="radiogroup" aria-label={t("Notenquelle")}>
              {([["random", t("Zufall")], ["scale", t("Tonleiter")], ["song", t("Lied")]] as const).map(([id, name]) => (
                <button key={id} role="radio" aria-checked={song.source === id} onClick={() => onSongChange({ ...song, source: id })}>
                  {name}
                </button>
              ))}
            </div>
            <span className="hint">{tuned.name} · {t(clef.name)}{songTitle ? ` · ${songTitle}` : ""}{scaleName ? ` · ${scaleName}` : ""}</span>
            <div className="practice-actions">
              <button onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>{t("Übungsbereich & Stimmung")}</button>
              {run ? <button onClick={() => setRun(0)}>{t("Beenden")}</button>
                   : <button className="primary" onClick={start} disabled={!canStart || (songMode && !loaded.song)}>{t("Start")}</button>}
            </div>

            <div className="practice-timing">
              {!fromSong && !(fromScale && scaleOrdered) && (
                <label title={t("Töne, die dir schwerfallen oder die du lange nicht geübt hast, kommen öfter dran.")}>
                  <input type="checkbox" checked={timing.adaptive} onChange={(e) => setTiming({ adaptive: e.target.checked })} />
                  <span>{t("Adaptiv")}</span>
                </label>
              )}
              <label title={t("Nimmt jeden Durchgang (bis {min} min) mit allen erkannten Tönen auf, um Fehlerkennungen zu untersuchen. Gespeichert unter Dokumente/Fretboard Trainer/Diagnose.", { min: DIAGNOSTIC_MAX_SEC / 60 })}>
                <input type="checkbox" checked={timing.diagnose} onChange={(e) => setTiming({ diagnose: e.target.checked })} />
                <span>{t("Diagnose-Aufnahme")}</span>
              </label>
              <label title={t("Bewertet, wie gleichmäßig laut deine Treffer sind – gemessen an deinen letzten Treffern. Außerhalb des Fensters gibt es weniger Punkte, aber keinen Fehler.")}>
                <input type="checkbox" checked={timing.dynamics} onChange={(e) => setTiming({ dynamics: e.target.checked })} />
                <span>{t("Lautstärke bewerten")}</span>
              </label>
              {timing.dynamics && (
                <>
                  <label>
                    <span>{t("Fenster")}</span>
                    <select value={timing.dynamicsWindowDb} onChange={(e) => setTiming({ dynamicsWindowDb: Number(e.target.value) })}>
                      {DYNAMICS_WINDOWS.map((w) => <option key={w} value={w}>±{w} dB</option>)}
                    </select>
                  </label>
                  <label title={t("Nach einem Durchgang mit mindestens 20 bewerteten Treffern, davon 80 % im Fenster, wird das Fenster enger.")}>
                    <input type="checkbox" checked={timing.dynamicsAuto} onChange={(e) => setTiming({ dynamicsAuto: e.target.checked })} />
                    <span>{t("automatisch enger")}</span>
                  </label>
                </>
              )}
              <label>
                <span>{t("Spielmodus")}</span>
                <select value={timing.mode} onChange={(e) => setTiming({ mode: e.target.value as ModeChoice })}>
                  {MODE_CHOICES.filter((m) => modeAvailable(m.id, fromSong)).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id === "auto" ? t("Nach Stufe ({mode})", { mode: t(MODE_CHOICES.find((c) => c.id === mode)?.name ?? mode) }) : t(m.name)}
                    </option>
                  ))}
                </select>
              </label>
              {songMode && (
                <>
                  <TempoControl percent={song.tempoPercent} bpm={loaded.song?.info.tempos[song.barFrom] ?? loaded.song?.info.tempos[0]}
                                onChange={(p) => onSongChange({ ...song, tempoPercent: p })} />
                  <label>
                    <input type="checkbox" checked={song.metronome} onChange={(e) => onSongChange({ ...song, metronome: e.target.checked })} />
                    <span>{t("Metronom")}</span>
                  </label>
                  <label title={t("Lautstärke von Metronom und Vorzähler (wirkt sofort)")}>
                    <input type="range" min={-40} max={0} step={1} value={timing.volumeDb} aria-label={t("Metronom-Lautstärke")}
                           onChange={(e) => setTiming({ volumeDb: Number(e.target.value) })} />
                    <span className="hint">{timing.volumeDb} dB</span>
                  </label>
                  {mode === "songPlay" && (
                    <label title={t("Wenn Treffer durchweg als „zu früh“ oder „zu spät“ gewertet werden, hier ausgleichen.")}>
                      <span>{t("Timing-Ausgleich")}</span>
                      <input type="number" min={-300} max={300} step={5} value={timing.offsetMs}
                             onChange={(e) => setTiming({ offsetMs: Math.min(300, Math.max(-300, Number(e.target.value) || 0)) })} />
                      <span className="hint">ms</span>
                    </label>
                  )}
                </>
              )}
              {rhythmMode && (
                <>
                  <label title={RHYTHM_LEVELS.map((l) => `${t(l.name)}: ${t(l.hint)}`).join("\n")}>
                    <span>{t("Rhythmus")}</span>
                    <select value={rhythm.level} onChange={(e) => onRhythmChange({ ...rhythm, level: e.target.value as RhythmSettings["level"] })}>
                      {RHYTHM_LEVELS.map((l) => <option key={l.id} value={l.id}>{t(l.name)}</option>)}
                    </select>
                  </label>
                  <label>
                    <select value={rhythm.bars} aria-label={t("Takte")} onChange={(e) => onRhythmChange({ ...rhythm, bars: Number(e.target.value) })}>
                      {RHYTHM_BARS.map((n) => <option key={n} value={n}>{t("{n} Takte", { n })}</option>)}
                    </select>
                  </label>
                  <label title={t("Tempo der Übung bei 100 %; während der Übung in Prozent veränderbar (auch automatisch steigern)")}>
                    <span>BPM</span>
                    <input type="number" min={30} max={220} value={timing.bpm}
                           onChange={(e) => setTiming({ bpm: Math.min(220, Math.max(30, Number(e.target.value) || 30)) })} />
                  </label>
                  <label title={t("Lautstärke von Metronom und Vorzähler (wirkt sofort)")}>
                    <input type="range" min={-40} max={0} step={1} value={timing.volumeDb} aria-label={t("Metronom-Lautstärke")}
                           onChange={(e) => setTiming({ volumeDb: Number(e.target.value) })} />
                    <span className="hint">{timing.volumeDb} dB</span>
                  </label>
                  <label title={t("Wenn Treffer durchweg als „zu früh“ oder „zu spät“ gewertet werden, hier ausgleichen.")}>
                    <span>{t("Timing-Ausgleich")}</span>
                    <input type="number" min={-300} max={300} step={5} value={timing.offsetMs}
                           onChange={(e) => setTiming({ offsetMs: Math.min(300, Math.max(-300, Number(e.target.value) || 0)) })} />
                    <span className="hint">ms</span>
                  </label>
                </>
              )}
              {mode === "timed" && (
                <>
                  <label>
                    <span>Tempo</span>
                    <select value={timing.tempo} onChange={(e) => setTiming({ tempo: e.target.value as TempoId })}>
                      {TEMPOS.map((tp) => <option key={tp.id} value={tp.id}>{t(tp.name)}</option>)}
                    </select>
                  </label>
                  {fromSong && (
                    <label title={t("Metronom im Tempo des Lieds (am Anfang des gewählten Taktbereichs).")}>
                      <input type="checkbox" checked={song.songTempo} onChange={(e) => onSongChange({ ...song, songTempo: e.target.checked })} />
                      <span>{t("Liedtempo")}</span>
                    </label>
                  )}
                  {liveBpm !== null ? (
                    <TempoControl label={t("Anteil|Tempo")} percent={song.tempoPercent} bpm={loaded.song?.info.tempos[song.barFrom] ?? loaded.song?.info.tempos[0]}
                                  onChange={(p) => onSongChange({ ...song, tempoPercent: p })} />
                  ) : (
                    <label>
                      <span>BPM</span>
                      <input type="number" min={30} max={220} value={timing.bpm}
                             onChange={(e) => setTiming({ bpm: Math.min(220, Math.max(30, Number(e.target.value) || 30)) })} />
                    </label>
                  )}
                  <label>
                    <span>{t("Metronom")}</span>
                    <input type="range" min={-40} max={0} step={1} value={timing.volumeDb}
                           onChange={(e) => setTiming({ volumeDb: Number(e.target.value) })} />
                  </label>
                  <label title={t("Wenn Treffer durchweg als „zu spät“ gewertet werden, obwohl du auf den Klick spielst, hier ausgleichen.")}>
                    <span>{t("Timing-Ausgleich")}</span>
                    <input type="number" min={-300} max={300} step={5} value={timing.offsetMs}
                           onChange={(e) => setTiming({ offsetMs: Math.min(300, Math.max(-300, Number(e.target.value) || 0)) })} />
                    <span className="hint">ms</span>
                  </label>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {fromSong && !run && !course && (
        <section className="card wide-card">
          <h2>{t("Lied")}</h2>
          <SongPanel instrument={instrument} tuned={tuned} practice={practice} song={song} loaded={loaded}
                     targets={fromSongTargets} chords={fromSongTargets?.targets.filter((t) => t.chord).length ?? 0}
                     onSongChange={onSongChange} onPracticeChange={onPracticeChange} />
        </section>
      )}

      {fromScale && !run && (
        <section className="card wide-card">
          <h2>{t("Tonleiter")}</h2>
          <ScalePanel tuned={tuned} practice={practice} scale={scale} positions={scalePos} sequence={scaleSeq}
                      onChange={onScaleChange} />
        </section>
      )}

      {review && !run && (
        <section className="card wide-card">
          {review.pending ? (
            <p className="hint">{t("Nachanalyse der Aufnahme läuft …")}</p>
          ) : review.error ? (
            <p className="hint bad">{t("Nachanalyse nicht möglich: {error}", { error: tCore(review.error) })}</p>
          ) : (
            <div className="review-result">
              <span>
                {t("Nachanalyse: Live {pct} %", { pct: percent(review.liveHits ?? 0, review.liveTotal ?? 0) })}
                {" → "}<strong>{t("Endwert {pct} %", { pct: percent(review.finalHits ?? 0, review.finalTotal ?? 0) })}</strong>
                <span className="hint"> ({review.finalHits}/{review.finalTotal})</span>
              </span>
              <button onClick={() => setShowReview((v) => !v)} aria-expanded={showReview}>
                {showReview ? t("Review schließen") : t("Review ansehen")}
              </button>
            </div>
          )}
          {showReview && !review.pending && <ReviewView sessionId={review.sessionId} />}
        </section>
      )}

      {narrowed !== null && !run && (
        <p className="hint diagnostic-result">
          {t("Gleichmäßig gespielt – das Lautstärke-Fenster ist jetzt ±{db} dB.", { db: narrowed })}
        </p>
      )}

      {diagnostic && !run && (
        <p className={`hint diagnostic-result ${diagnostic.error ? "bad" : ""}`}>
          {diagnostic.error ? t("Diagnose-Aufnahme nicht gespeichert: {error}", { error: tCore(diagnostic.error) })
                            : t("Diagnose-Aufnahme gespeichert: {path}", { path: diagnostic.path ?? "" })}
        </p>
      )}

      {showSettings && (
        <section className="card wide-card">
          <h2>{t("Übungsbereich & Stimmung")} · {instrument.name}</h2>
          <PracticeSettings instrument={instrument} practice={practice} onChange={onPracticeChange} />
        </section>
      )}

      {!run && (
        <section className="card wide-card practice-stage">
          <div className="practice-idle">
            <Staff clef={clef} notes={[]} sizeFor={pitches.keys()} />
            {rhythmMode ? (
              <p>
                {t("Die Töne kommen mit echten Notenlängen und Pausen ({cells}, {bars} Takte, {bpm} BPM), in Noten und Tabulatur mit mitlaufendem Cursor. Nach dem Vorzähler spielst du mit; jede Note wird im Zeitfenster bewertet. Das Tempo lässt sich während der Übung ändern und automatisch steigern; jeder Start erzeugt eine neue Übung.", { cells: t(RHYTHM_LEVELS.find((l) => l.id === rhythm.level)?.hint ?? ""), bars: rhythm.bars, bpm: timing.bpm })}
              </p>
            ) : songMode ? (
              <p>
                {mode === "songPlay"
                  ? t("Das Lied läuft mit allen Spuren im gewählten Tempo, Noten und Tabulatur deiner Spur laufen mit. Nach dem Vorzähler spielst du mit; jede Note wird mit ihrer echten Länge im Zeitfenster bewertet.")
                  : t("Das Lied läuft, bis die nächste Note deiner Spur dran ist, und wartet dann, bis du sie spielst – so übst du Stellen im eigenen Tempo.")}
                {!loaded.song && " " + t("Wähle zuerst ein Lied.")}
              </p>
            ) : mode === "wait" ? (
              <p>
                {t("Spiel die angezeigte Note. Die nächste erscheint erst, wenn der richtige Ton erkannt wurde – die Oktave muss stimmen.")}
                {level.showFretboard && " " + t("Auf dem Griffbrett siehst du, wo der Ton liegt und mit welchem Finger du greifst.")}
                {!level.showFretboard && level.showNoteChart && " " + t("Das Griffbrett zeigt alle Tonnamen als Nachschlagehilfe.")}
                {!level.showName && " " + t("Notennamen werden auf dieser Stufe nicht angezeigt.")}
              </p>
            ) : (
              <p>
                {t("Nach vier Schlägen Vorzähler fällt jede Note auf einen Schlag ({tempo}, {bpm} BPM). Gewertet wird innerhalb von ±¼ Schlag; je genauer, desto mehr Punkte. Die Zeitleiste zeigt, wann die nächste Note fällig ist.", { tempo: t(tempoById(timing.tempo).name), bpm: runTiming.bpm })}
              </p>
            )}
            <button className="primary" onClick={start} disabled={!canStart || (songMode && !loaded.song)}>{t("Übung starten")}</button>
          </div>
        </section>
      )}

      {run > 0 && songMode && loaded.song && (
        <SongErrorBoundary key={run}>
          <Suspense fallback={<section className="card wide-card"><p className="hint">{t("Song-Modus wird geladen …")}</p></section>}>
            <SongRun mode={mode} song={loaded.song} settings={song} tuned={tuned} difficulty={difficulty}
                     timing={timing} dynamics={dynamics} onSongChange={onSongChange}
                     onVolumeChange={courseKey ? (db) => setTiming({ volumeDb: db }) : undefined}
                     session={courseKey ? { mode, source: "course", gpFile: courseKey } : undefined} />
          </Suspense>
        </SongErrorBoundary>
      )}
      {run > 0 && rhythmMode && !rhythmRun && (
        <section className="card wide-card"><p className="hint">{t("Übung wird erzeugt …")}</p></section>
      )}
      {run > 0 && rhythmMode && rhythmRun && (
        <SongErrorBoundary key={run}>
          <Suspense fallback={<section className="card wide-card"><p className="hint">{t("Rhythmus-Übung wird geladen …")}</p></section>}>
            <SongRun mode="songPlay" song={rhythmRun.song} settings={rhythmRun.settings} tuned={tuned} difficulty={difficulty}
                     timing={timing} dynamics={dynamics}
                     session={{ mode: "rhythm", source: fromScale ? "scale" : "random", gpFile: scaleName }}
                     onSongChange={(s) => {
                       setRhythmRun((r) => (r ? { ...r, settings: s } : r));
                       onRhythmChange(fromSongSettings(rhythm, s));
                     }} />
          </Suspense>
        </SongErrorBoundary>
      )}
      {run > 0 && mode === "wait" && (
        <WaitRun key={run} tuned={tuned} practice={practice} clef={clef} level={level} difficulty={difficulty}
                 pitches={pitches} centsTolerance={centsTolerance} source={source} dynamics={dynamics} songName={songName} scaleName={scaleName} songTrack={song.track} />
      )}
      {run > 0 && mode === "timed" && (
        <TimedRun key={run} tuned={tuned} practice={practice} clef={clef} level={level} difficulty={difficulty}
                  pitches={pitches} timing={runTiming} source={source} dynamics={dynamics} songName={songName} scaleName={scaleName}
                  courseKey={courseKey} songTrack={song.track} />
      )}
    </>
  );
}
