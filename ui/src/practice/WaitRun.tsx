import { useEffect, useRef, useState } from "react";
import { api, noteName, type ReviewItemIn } from "../api";
import { Staff, type StaffNote } from "../components/Staff";
import type { Instrument } from "../instruments";
import { spell, type Clef } from "../music/notation";
import { accuracy, ignoredNote, LevelReference, meanReactionMs, onPlayedChord, onPlayedNote, playableRange, startPractice, type Difficulty, type DifficultyInfo, type PracticeState } from "./engine";
import { targetMidis, type Target, type TargetSource } from "./generator";
import { chordSymbol } from "./chords";
import { logTargets } from "./diagnostics";
import { useSessionRecorder } from "./useSessionRecorder";
import type { InstrumentPractice } from "./settings";
import { TargetBoard } from "./TargetBoard";
import { dynamicsFactor } from "./dynamics";
import { DynamicsStats, LevelBadge, useDynamics, type DynamicsOptions } from "./DynamicsView";
import { t } from "../i18n";

interface WaitRunProps {
  tuned: Instrument;
  practice: InstrumentPractice;
  clef: Clef;
  level: DifficultyInfo;
  difficulty: Difficulty;
  pitches: Map<number, Target[]>;
  centsTolerance: number;
  source: TargetSource; // Zufall (ggf. gewichtet) oder Lied
  dynamics: DynamicsOptions;
  songName?: string; // Notenquelle Lied
  scaleName?: string; // Notenquelle Tonleiter (Name für die Statistik)
  songTrack?: number;
}

const FEEDBACK_MS = 900;
/** Bindebogen zur vorigen Note: H (aufwärts) oder P (abwärts), nur bei gebundenen Zielnoten. */
export const slurOf = (t: Target, previousMidi: number | null | undefined): "H" | "P" | undefined =>
  t.legato && previousMidi != null ? (t.midi > previousMidi ? "H" : "P") : undefined;

/** Name einer Zielnote: Ton mit Oktave, Akkord mit Symbol. */
export const targetName = (tg: Target) =>
  (tg.chord ? t("Akkord {name}", { name: chordSymbol(targetMidis(tg), tg.flat) }) : formatName(tg.midi, tg.flat));

/** Fehlende Akkordtöne für die Rückmeldung. */
export const missingText = (missing: number[], flat?: boolean) =>
  t("Akkord unvollständig – es fehlt {notes}", { notes: missing.map((m) => formatName(m, flat)).join(", ") });

/** Abweichung in Worten: „genau“ oder „… ms zu früh/zu spät“. */
export const offBy = (ms: number) =>
  Math.abs(ms) < 15 ? t("genau") : ms < 0 ? t("{ms} ms zu früh", { ms: Math.round(-ms) }) : t("{ms} ms zu spät", { ms: Math.round(ms) });

/** „{n} von {total} Tönen“ eines teilweise gespielten Akkords. */
export const chordPart = (present: number, judged: number) => t("{n} von {total} Tönen", { n: present, total: judged });

/** Name mit Oktave; mit Ziel-Schreibweise (♯/♭) wie im Notensystem. */
export const formatName = (midi: number, flat?: boolean) => {
  const s = spell(midi, flat);
  return `${s.name}${noteName(midi).octave}`;
};

/** Warte-Modus: die nächste Note erscheint erst nach dem richtigen Ton. */
export function WaitRun({ tuned, practice, clef, level, difficulty, pitches, centsTolerance, source, dynamics, songName, scaleName, songTrack }: WaitRunProps) {
  const dyn = useDynamics(dynamics);
  const [state, setState] = useState<PracticeState>(() => startPractice(source, performance.now()));
  const scoreRef = useRef(0);
  // Nachanalyse: gespielte Zielnoten in Reihenfolge (nur die Reihenfolge zählt)
  const reviewItems = useRef<ReviewItemIn[]>([]);
  const record = useSessionRecorder(
    { instrument: tuned.id, difficulty, mode: "wait", tempo: "", bpm: 0, dynamicsWindowDb: dynamics.on ? dynamics.windowDb : undefined,
      source: songName ? "gp" : scaleName ? "scale" : "random", gpFile: songName ?? scaleName, gpTrack: songTrack },
    scoreRef,
    () => ({ mode: "wait", toleranceMs: 0, items: reviewItems.current,
             liveHits: stateRef.current.stats.hits, liveMisses: stateRef.current.stats.misses }),
  );
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const stateRef = useRef(state);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const playable = playableRange(tuned);
    const levels = new LevelReference();
    const show = (next: PracticeState) => {
      stateRef.current = next;
      scoreRef.current = next.stats.score;
      setState(next);
      setFlash(next.last?.kind === "hit" ? "hit" : next.last ? "miss" : null);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FEEDBACK_MS);
    };
    // Griffposition für die Statistik nur, wenn sie angezeigt wurde
    const posOf = (t: Target) => ({
      ...(level.showFretboard ? { string: t.string, fret: t.fret } : { string: -1, fret: -1 }),
      bar: t.bar,
    });

    const off = api.onNote((note) => {
      if (ignoredNote(note, stateRef.current.queue[0]?.midi, playable, levels.value())) return;
      levels.add(note);
      const rating = dyn.rate(note, stateRef.current.queue[0]?.midi);
      const next = onPlayedNote(stateRef.current, note, centsTolerance, source, performance.now(), difficulty,
                                dynamicsFactor(rating));
      if (next === stateRef.current) return;

      // Versuch für die Statistik
      const fb = next.last;
      if (fb?.kind === "hit") {
        dyn.hit(note, rating);
        reviewItems.current.push({ midis: targetMidis(fb.target), live: "hit" });
        record({ expectedMidi: fb.target.midi, ...posOf(fb.target), playedMidi: note.midi, cents: note.cents, reactionMs: fb.reactionMs,
                 onsetType: note.onsetType, correct: true, noteTimeMs: note.timeMs,
                 levelDb: note.levelDb, levelDevDb: rating?.deviationDb });
      } else if (fb?.kind === "miss") {
        record({ expectedMidi: fb.target.midi, ...posOf(fb.target), playedMidi: fb.played, cents: note.cents, onsetType: note.onsetType,
                 correct: false, noteTimeMs: note.timeMs });
      }
      show(next);
    });
    // Akkorde: Ergebnis der Akkordprüfung des Kerns
    const offChord = api.onChord((ev) => {
      const next = onPlayedChord(stateRef.current, ev, source, performance.now(), difficulty);
      if (next === stateRef.current) return;
      const fb = next.last;
      if (fb?.kind === "hit") reviewItems.current.push({ midis: targetMidis(fb.target), live: "hit" });
      if (fb?.kind === "hit")
        record({ expectedMidi: fb.target.midi, ...posOf(fb.target), playedMidi: fb.target.midi, reactionMs: fb.reactionMs,
                 onsetType: "pick", correct: true, noteTimeMs: ev.timeMs });
      else if (fb?.kind === "chordMiss")
        record({ expectedMidi: fb.target.midi, ...posOf(fb.target), onsetType: "pick", correct: false, noteTimeMs: ev.timeMs });
      show(next);
    });
    return () => {
      off();
      offChord();
      window.clearTimeout(flashTimer.current);
    };
  }, [pitches, centsTolerance, difficulty]);

  const current = state.queue[0];

  // Erwarteten Ton an den Kern melden (Oktavprüfung bei nachklingendem vorigem Ton; Akkord: Akkordprüfung)
  const expected = current ? targetMidis(current) : [];
  useEffect(() => {
    api.setExpectedNotes(expected);
    logTargets(expected);
  }, [expected.join(",")]);
  useEffect(() => () => void api.setExpectedNotes([]), []);

  const staffNotes: StaffNote[] = state.queue.map((t, i) => ({
    midi: t.midi,
    flat: t.flat,
    chord: t.chord ? targetMidis(t) : undefined,
    slur: slurOf(t, i > 0 ? state.queue[i - 1].midi : state.lastHitMidi),
    state: i === 0 ? (flash === "miss" ? "miss" : "current") : "upcoming",
    label: i === 0 && level.showName ? (t.chord ? chordSymbol(targetMidis(t), t.flat) : spell(t.midi, t.flat).name) : undefined,
  }));
  const { last, stats } = state;

  return (
    <>
      <section className={`card wide-card practice-stage ${flash ?? ""}`} data-target={current?.midi}>
        <Staff clef={clef} notes={staffNotes} sizeFor={pitches.keys()} />
        <TargetBoard tuned={tuned} practice={practice} level={level} target={current} />
        <div className="practice-feedback" aria-live="polite">
          {last?.kind === "hit" && (
            <span className="ok">
              {t("Richtig: {note}", { note: targetName(last.target) })} · {(last.reactionMs / 1000).toFixed(2)} s · +{last.points}
              {last.chord && last.chord.present < last.chord.judged && " · " + chordPart(last.chord.present, last.chord.judged)}
              {!last.inTune && " · " + t("{cents} Cent – Stimmung prüfen?", { cents: `${last.cents > 0 ? "+" : ""}${last.cents.toFixed(0)}` })}
              {last.picked && " · " + t("angeschlagen statt Hammer-on/Pull-off (halbe Punkte)")}
            </span>
          )}
          {last?.kind === "hit" && dyn.on && <LevelBadge rating={dyn.last} windowDb={dyn.windowDb} />}
          {last?.kind === "miss" && (
            <span className="bad">
              {t("Gespielt: {note}", { note: formatName(last.played) })}
              {" – "}{last.octaveOff ? t("richtiger Ton, aber falsche Oktave") : t("nochmal versuchen")}
            </span>
          )}
          {last?.kind === "chordMiss" && <span className="bad">{missingText(last.missing, last.target.flat)} – {t("nochmal")}</span>}
          {!last && <span className="hint">{t("Bereit – spiel die erste Note.")}</span>}
          {!current && last && <span className="ok song-end">{t("Ende des Lieds – {hits} Treffer, {misses} Fehler.", { hits: stats.hits, misses: stats.misses })}</span>}
          {current?.bar !== undefined && <span className="hint song-bar">{t("Takt {n}", { n: current.bar + 1 })}</span>}
        </div>
      </section>

      <section className="card wide-card">
        <div className="result-stats">
          <div className="accuracy good"><span>{t("Punkte")}</span>{stats.score}</div>
          <div><span>{t("Treffer")}</span>{stats.hits}</div>
          <div><span>{t("Fehler")}</span>{stats.misses}</div>
          <div><span>{t("Quote")}</span>{Math.round(accuracy(stats) * 100)} %</div>
          <div><span>{t("Ø Reaktionszeit")}</span>{stats.hits > 0 ? `${(meanReactionMs(stats) / 1000).toFixed(2)} s` : "–"}</div>
          <div><span>{t("Serie")}</span>{stats.streak}</div>
          <div><span>{t("Beste Serie")}</span>{stats.bestStreak}</div>
          {dyn.on && <DynamicsStats summary={dyn.summary} />}
        </div>
      </section>
    </>
  );
}
