// Song-Modus (SPEC: Rhythmus): Zeitachse eines Lieds mit echten Notenlängen in Wiedergabe-
// Reihenfolge (Wiederholungen aufgelöst, Tempowechsel berücksichtigt) und die Bewertung beim
// Mitspielen bzw. im Warte-Modus. Zeiten in „Lied-ms“: Position im Lied bei 100 % Tempo.

import { midi, Settings } from "@coderline/alphatab";
import type { ChordEvent } from "../api";
import { judgeChord, type ChordScore } from "../practice/chords";
import type { Difficulty } from "../practice/engine";
import { points, reactionAccuracy } from "../practice/scoring";
import type { Score } from "./gpImport";

const TICKS_PER_QUARTER = 960;

export interface TempoPoint {
  tick: number;
  bpm: number; // Viertel je Minute
  ms: number; // Lied-ms an dieser Stelle
}

export interface SongBeat {
  tick: number; // Wiedergabe-Tick (Wiederholungen aufgelöst)
  ms: number;
  midis: number[]; // gespielte Töne (Akkord: mehrere, bewertet über die Akkordprüfung des Kerns)
  bar: number; // Takt im Notenbild (0-basiert)
  flat: boolean;
  string: number; // tiefster Ton: Saite (0 = tiefste) und Bund
  fret: number;
  legato: boolean;
  quarterMs: number; // Dauer einer Viertel an dieser Stelle (für das Toleranzfenster)
}

export interface SongTimeline {
  beats: SongBeat[];
  startTick: number; // Wiedergabebereich
  endTick: number;
  startMs: number;
  endMs: number;
  tempo: TempoPoint[];
  barStarts: { bar: number; tick: number }[]; // Taktanfänge im Bereich, in Wiedergabe-Reihenfolge
}

/** Lied-ms eines Wiedergabe-Ticks. */
export function tickToMs(tempo: TempoPoint[], tick: number): number {
  let p = tempo[0] ?? { tick: 0, bpm: 120, ms: 0 };
  for (const t of tempo) {
    if (t.tick > tick) break;
    p = t;
  }
  return p.ms + ((tick - p.tick) / TICKS_PER_QUARTER) * (60000 / p.bpm);
}

function buildTempo(changes: { tick: number; tempo: number }[]): TempoPoint[] {
  const sorted = [...changes].sort((a, b) => a.tick - b.tick);
  const out: TempoPoint[] = [];
  for (const c of sorted) {
    const ms = out.length ? tickToMs(out, c.tick) : (c.tick / TICKS_PER_QUARTER) * 500;
    if (out.length && out[out.length - 1].tick === c.tick) out[out.length - 1] = { tick: c.tick, bpm: c.tempo, ms };
    else out.push({ tick: c.tick, bpm: c.tempo, ms });
  }
  return out.length ? out : [{ tick: 0, bpm: 120, ms: 0 }];
}

/** Zeitachse einer Spur im Taktbereich (barTo -1 = bis zum Ende; bei Wiederholungen das erste Vorkommen). */
export function songTimeline(score: Score, track: number, barFrom = 0, barTo = -1): SongTimeline {
  const settings = new Settings();
  const file = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(score, settings, new midi.AlphaSynthMidiFileHandler(file));
  generator.generate();
  const lookups = generator.tickLookup.masterBars;
  const tempo = buildTempo(lookups.flatMap((mb) => mb.tempoChanges.map((t) => ({ tick: t.tick, tempo: t.tempo }))));

  const first = lookups.findIndex((mb) => mb.masterBar.index === barFrom);
  const startIndex = Math.max(0, first);
  let endIndex = lookups.length - 1;
  if (barTo >= 0) {
    const found = lookups.findIndex((mb, i) => i >= startIndex && mb.masterBar.index === barTo);
    if (found >= 0) endIndex = found;
  }
  const startTick = lookups[startIndex]?.start ?? 0;
  const endTick = lookups[endIndex]?.end ?? 0;

  const beats: SongBeat[] = [];
  const barStarts: SongTimeline["barStarts"] = [];
  const seen = new Set<string>();
  for (let i = startIndex; i <= endIndex; i++) {
    const mb = lookups[i];
    barStarts.push({ bar: mb.masterBar.index, tick: mb.start });
    for (let slice = mb.firstBeat; slice; slice = slice.nextBeat) {
      for (const item of slice.highlightedBeats) {
        const beat = item.beat;
        if (item.playbackStart !== slice.start || beat.voice.index !== 0) continue; // nur Anschläge, erste Stimme
        if (beat.voice.bar.staff.track.index !== track || beat.voice.bar.staff.index !== 0) continue;
        const key = `${i}:${beat.id}`;
        if (seen.has(key) || beat.isRest) continue;
        seen.add(key);
        const played = beat.notes.filter((n) => !n.isTieDestination && !n.isDead);
        if (played.length === 0) continue;
        const lowest = played.reduce((a, b) => (b.realValue < a.realValue ? b : a));
        const tick = mb.start + item.playbackStart;
        const keySignature = beat.voice.bar.masterBar.keySignature as number;
        const mode = lowest.accidentalMode as number; // 3/4 = ♯ erzwungen, 5/6 = ♭ erzwungen
        const at = tempo.filter((t) => t.tick <= tick).pop() ?? tempo[0];
        beats.push({
          tick,
          ms: tickToMs(tempo, tick),
          midis: played.map((n) => n.realValue),
          bar: mb.masterBar.index,
          flat: mode === 5 || mode === 6 ? true : mode === 3 || mode === 4 ? false : keySignature < 0,
          string: beat.voice.bar.staff.isStringed ? lowest.string - 1 : -1,
          fret: beat.voice.bar.staff.isStringed ? lowest.fret : -1,
          legato: played.some((n) => n.isHammerPullDestination),
          quarterMs: 60000 / at.bpm,
        });
      }
      if (slice === mb.lastBeat) break;
    }
  }
  beats.sort((a, b) => a.tick - b.tick);
  return { beats, startTick, endTick, startMs: tickToMs(tempo, startTick), endMs: tickToMs(tempo, endTick), tempo, barStarts };
}

/** Sprung um `steps` Takte (negativ = zurück) von der Position `tick` aus, im Bereich der Zeitachse. */
export function barJump(barStarts: SongTimeline["barStarts"], tick: number, steps: number): number {
  if (barStarts.length === 0) return tick;
  let i = 0;
  while (i + 1 < barStarts.length && barStarts[i + 1].tick <= tick) i++;
  return barStarts[Math.max(0, Math.min(barStarts.length - 1, i + steps))].tick;
}

// ---------- Bewertung

export type SongResult =
  | { kind: "hit"; errorMs: number; points: number; chord?: ChordScore } // errorMs in echter Zeit (+ = zu spät)
  | { kind: "missed" };

export type SongFeedback =
  | { kind: "hit"; beat: SongBeat; errorMs: number; points: number; chord?: ChordScore }
  | { kind: "wrong"; beat: SongBeat; played: number }
  | { kind: "chordMiss"; beat: SongBeat; missing: number[] } // zu wenige Akkordtöne
  | { kind: "missed"; beat: SongBeat };

const isChord = (b: SongBeat) => b.midis.length > 1;

export interface SongStats {
  hits: number;
  misses: number;
  streak: number;
  bestStreak: number;
  score: number;
  timingErrorsMs: number[];
}

export interface SongPlayState {
  beats: SongBeat[];
  results: (SongResult | undefined)[];
  cursor: number; // erste noch offene Note (Warte-Modus: die erwartete)
  stats: SongStats;
  last: SongFeedback | null;
}

export const startSongPlay = (beats: SongBeat[]): SongPlayState => ({
  beats,
  results: beats.map(() => undefined),
  cursor: 0,
  stats: { hits: 0, misses: 0, streak: 0, bestStreak: 0, score: 0, timingErrorsMs: [] },
  last: null,
});

const advance = (results: (SongResult | undefined)[], from: number) => {
  let c = from;
  while (c < results.length && results[c]) c++;
  return c;
};

function hit(
  s: SongPlayState, index: number, errorMs: number, accuracy: number, difficulty: Difficulty, factor: number, chord?: ChordScore,
): SongPlayState {
  const results = [...s.results];
  const streak = s.stats.streak + 1;
  // Akkord: Punkte anteilig nach angeschlagenen Akkordtönen
  const share = chord ? chord.present / Math.max(1, chord.judged) : 1;
  const p = Math.round(points(accuracy, streak, difficulty) * factor * share);
  results[index] = { kind: "hit", errorMs, points: p, chord };
  return {
    ...s,
    results,
    cursor: advance(results, s.cursor),
    stats: {
      ...s.stats,
      hits: s.stats.hits + 1,
      streak,
      bestStreak: Math.max(s.stats.bestStreak, streak),
      score: s.stats.score + p,
      timingErrorsMs: [...s.stats.timingErrorsMs, errorMs],
    },
    last: { kind: "hit", beat: s.beats[index], errorMs, points: p, chord },
  };
}

const chordMiss = (s: SongPlayState, beat: SongBeat, missing: number[]): SongPlayState => ({
  ...s,
  stats: { ...s.stats, misses: s.stats.misses + 1, streak: 0 },
  last: { kind: "chordMiss", beat, missing },
});

const wrong = (s: SongPlayState, beat: SongBeat, played: number): SongPlayState => ({
  ...s,
  stats: { ...s.stats, misses: s.stats.misses + 1, streak: 0 },
  last: { kind: "wrong", beat, played },
});

/** Mitspielen: Toleranzfenster (Lied-ms) = toleranceBeats Viertel. */
export const songWindowMs = (beat: SongBeat, toleranceBeats: number) => toleranceBeats * beat.quarterMs;

/** Mitspielen: Ton zur Lied-Zeit songMs. Treffer = nächste offene Note im Fenster mit diesem Ton;
    sonst ein falscher Ton, wenn gerade eine Note fällig ist; sonst (zwischen den Noten) ignoriert.
    Akkorde zählen hier nicht: sie bewertet onSongChord aus der Akkordprüfung. */
export function onSongPlayed(
  s: SongPlayState, songMs: number, midiPlayed: number, toleranceBeats: number, speed: number,
  difficulty: Difficulty, factor = 1,
): SongPlayState {
  let best = -1, bestDist = Infinity, due: SongBeat | null = null;
  for (let i = s.cursor; i < s.beats.length; i++) {
    const b = s.beats[i];
    const win = songWindowMs(b, toleranceBeats);
    if (b.ms - win > songMs) break;
    if (s.results[i] || isChord(b) || Math.abs(songMs - b.ms) > win) continue;
    due ??= b;
    const dist = Math.abs(songMs - b.ms);
    if (b.midis.includes(midiPlayed) && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  if (best >= 0) {
    const b = s.beats[best];
    const win = songWindowMs(b, toleranceBeats);
    return hit(s, best, (songMs - b.ms) / speed, 1 - bestDist / win, difficulty, factor);
  }
  return due ? wrong(s, due, midiPlayed) : s;
}

/** Mitspielen: Akkordprüfung zum Anschlag bei Lied-Zeit songMs. Treffer = nächster offener Akkord im
    Fenster mit genug Akkordtönen (Punkte anteilig); zu wenige: Fehler, der Akkord bleibt offen. */
export function onSongChord(
  s: SongPlayState, songMs: number, ev: ChordEvent, toleranceBeats: number, speed: number, difficulty: Difficulty, factor = 1,
): SongPlayState {
  for (let i = s.cursor; i < s.beats.length; i++) {
    const b = s.beats[i];
    const win = songWindowMs(b, toleranceBeats);
    if (b.ms - win > songMs) break;
    if (s.results[i] || !isChord(b) || Math.abs(songMs - b.ms) > win) continue;
    const v = judgeChord(ev, b.midis, difficulty);
    if (!v) continue;
    if (!v.hit) return chordMiss(s, b, v.missing);
    return hit(s, i, (songMs - b.ms) / speed, 1 - Math.abs(songMs - b.ms) / win, difficulty, factor,
               { present: v.present, judged: v.judged });
  }
  return s;
}

/** Mitspielen: Noten, deren Fenster vor songMs zu Ende ist, gelten als verpasst; Akkorde erst chordLagMs
    (Lied-ms) später, weil das Ergebnis der Akkordprüfung nach dem Anschlag kommt. */
export function expireSong(s: SongPlayState, songMs: number, toleranceBeats: number, chordLagMs = 0): SongPlayState {
  let results = s.results;
  let stats = s.stats;
  let last = s.last;
  for (let i = s.cursor; i < s.beats.length; i++) {
    const b = s.beats[i];
    if (b.ms + songWindowMs(b, toleranceBeats) + (isChord(b) ? chordLagMs : 0) >= songMs) break;
    if (results[i]) continue;
    if (results === s.results) results = [...results];
    results[i] = { kind: "missed" };
    stats = { ...stats, misses: stats.misses + 1, streak: 0 };
    last = { kind: "missed", beat: b };
  }
  return results === s.results ? s : { ...s, results, cursor: advance(results, s.cursor), stats, last };
}

/** Warte-Modus: Die Wiedergabe hält an der nächsten offenen Note; zählt nur sie.
    waitedMs: wie lange die Wiedergabe schon auf diesen Ton wartet (0 = rechtzeitig gespielt). */
export function onSongWaitPlayed(s: SongPlayState, midiPlayed: number, waitedMs: number, difficulty: Difficulty, factor = 1): SongPlayState {
  const b = s.beats[s.cursor];
  if (!b || isChord(b)) return s; // Akkord: siehe onSongWaitChord
  if (!b.midis.includes(midiPlayed)) return wrong(s, b, midiPlayed);
  return hit(s, s.cursor, waitedMs, reactionAccuracy(waitedMs + 500), difficulty, factor);
}

/** Warte-Modus: Akkordprüfung für den erwarteten Akkord. */
export function onSongWaitChord(s: SongPlayState, ev: ChordEvent, waitedMs: number, difficulty: Difficulty, factor = 1): SongPlayState {
  const b = s.beats[s.cursor];
  if (!b || !isChord(b)) return s;
  const v = judgeChord(ev, b.midis, difficulty);
  if (!v) return s;
  if (!v.hit) return chordMiss(s, b, v.missing);
  return hit(s, s.cursor, waitedMs, reactionAccuracy(waitedMs + 500), difficulty, factor, { present: v.present, judged: v.judged });
}

/** Trefferquote eines Durchlaufs (offene Noten zählen nicht als Treffer). */
export const passAccuracy = (s: SongPlayState) =>
  s.beats.length ? s.results.filter((r) => r?.kind === "hit").length / s.beats.length : 0;

/** Neuer Durchlauf (Wiederholen): alle Ergebnisse zurück, Statistik bleibt. */
export const restartPass = (s: SongPlayState): SongPlayState => ({ ...s, results: s.beats.map(() => undefined), cursor: 0 });
