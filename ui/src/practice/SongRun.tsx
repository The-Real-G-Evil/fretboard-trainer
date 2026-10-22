// Song-Modus: Der Kern spielt das Lied (alle Spuren, Soundfont) über das Audio-Gerät der App – zusammen
// mit Mithören und Metronom und auf derselben Stream-Uhr wie die Erkennung. alphaTab zeigt Noten und
// Tabulatur der eigenen Spur; sein Cursor folgt der Position des Kerns (externe Zeitachse). Zwei Varianten:
// - Mitspielen: Wiedergabe im gewählten Tempo, jede Note wird im Toleranzfenster bewertet.
// - Warten: Der Kern hält sample-genau an jeder Note der eigenen Spur, bis sie gespielt ist.

import { AlphaTabApi, PlayerMode, ScrollMode, Settings, type model } from "@coderline/alphatab";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type NoteEvent, type SongPosition } from "../api";
import type { Instrument } from "../instruments";
import type { LoadedSong } from "./SongPanel";
import {
  barJump, expireSong, onSongPlayed, onSongWaitPlayed, restartPass, songTimeline, startSongPlay, tickToMs,
  type SongBeat, type SongPlayState,
} from "../song/songTiming";
import { channelGains, coreSong } from "../song/songMidi";
import { LOOP_PASSES, MAX_TRACK_VOLUME, mixFor, withMix, type SongSettings, type TrackMix } from "../song/songPractice";
import type { BarRect } from "../song/barGeometry";
import { RangeMarkers, type MarkerKind } from "./RangeMarkers";
import { ignoredNote, LevelReference, playableRange, type Difficulty } from "./engine";
import { toleranceBeats, type TimingSettings } from "./timing";
import { timingSummary } from "./timed";
import { useSessionRecorder } from "./useSessionRecorder";
import { logTargets } from "./diagnostics";
import { dynamicsFactor } from "./dynamics";
import { DynamicsStats, LevelBadge, useDynamics, type DynamicsOptions } from "./DynamicsView";
import { formatName } from "./WaitRun";

type Track = model.Track;

export interface SongRunProps {
  mode: "songPlay" | "songWait";
  song: LoadedSong;
  settings: SongSettings;
  tuned: Instrument;
  difficulty: Difficulty;
  timing: TimingSettings; // Timing-Ausgleich
  dynamics: DynamicsOptions;
  onSongChange: (s: SongSettings) => void; // Mischpult und Spurwahl
}

type Status = "loading" | "ready" | "countIn" | "playing" | "waiting" | "paused" | "done" | "error";

const EXPIRE_LAG_MS = 200; // Erkennung meldet Töne verzögert: Fenster erst danach abschließen
// Zwischen zwei Positionsmeldungen (ca. 60 Hz) höchstens so weit fortschreiben
const EXTRAPOLATE_MAX_MS = 300;

interface ExternalOutput {
  handler?: unknown;
  updatePosition(ms: number): void;
}

export default function SongRun({ mode, song, settings, tuned, difficulty, timing, dynamics, onSongChange }: SongRunProps) {
  const track = Math.max(0, settings.track);
  const speed = settings.tempoPercent / 100;
  const timeline = useMemo(() => {
    // nur Töne, die auf dem eigenen Instrument vorkommen (sonst wartet der Warte-Modus ewig)
    const [lo, hi] = playableRange(tuned);
    const t = songTimeline(song.score, track, settings.barFrom, settings.barTo);
    const beats = t.beats
      .map((b) => ({ ...b, midis: b.midis.filter((m) => m >= lo && m <= hi) }))
      .filter((b) => b.midis.length > 0);
    return { ...t, beats };
  }, [song.score, track, settings.barFrom, settings.barTo]);

  // Mischpult: Lautstärke/Stumm/Solo je Spur, wirkt sofort auf die laufende Wiedergabe im Kern
  const mix = mixFor(settings, song.score.tracks.length);
  const mixKey = JSON.stringify(mix);
  const loaded = useRef(false);
  const setMix = (i: number, patch: Partial<TrackMix>) =>
    onSongChange(withMix(settings, mix.map((m, j) => (j === i ? { ...m, ...patch } : m))));
  const tolerance = toleranceBeats(difficulty);
  const metronomeGain = Math.pow(10, timing.volumeDb / 20); // wie beim getakteten Modus (dB)

  const host = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [barRects, setBarRects] = useState<(BarRect | undefined)[]>([]);
  const [placing, setPlacing] = useState<MarkerKind | null>(null);
  const lastBar = song.score.masterBars.length - 1;
  const rangeTo = settings.barTo < 0 ? lastBar : Math.min(settings.barTo, lastBar);
  const setRange = (from: number, to: number) =>
    onSongChange({ ...settings, barFrom: from, barTo: to >= lastBar ? -1 : to });
  const scroller = useRef<HTMLDivElement>(null);
  const cursorOut = useRef<ExternalOutput | null>(null);
  const alpha = useRef<AlphaTabApi | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SongPlayState>(() => startSongPlay(timeline.beats));
  const stateRef = useRef(state);
  const statusRef = useRef(status);
  statusRef.current = status;

  // Position des Kerns: Tick zu einer Stream-Zeit, dazu die Systemzeit des Empfangs
  const pos = useRef({ tick: timeline.startTick, streamMs: 0, perf: performance.now(), advancing: false, pass: 0, latencyMs: 0 });
  const waitedSince = useRef<number | null>(null);

  const dyn = useDynamics(dynamics);
  const record = useSessionRecorder(
    { instrument: tuned.id, difficulty, mode, tempo: `${settings.tempoPercent}%`,
      bpm: Math.round((timeline.tempo[0]?.bpm ?? 0) * speed), dynamicsWindowDb: dynamics.on ? dynamics.windowDb : undefined,
      source: "gp", gpFile: song.name, gpTrack: track },
    { get current() { return stateRef.current.stats.score; } },
  );

  // Autoscroll: die Notenzeile mit dem Cursor steht oben im Fenster (nur bei Zeilenwechsel scrollen)
  const lastLineTop = useRef<number | null>(null);
  const keepLineOnTop = () => {
    const box = scroller.current;
    const bar = box?.querySelector<HTMLElement>(".at-cursor-bar");
    if (!box || !bar) return;
    const top = bar.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (lastLineTop.current !== null && Math.abs(top - lastLineTop.current) < 4) return;
    lastLineTop.current = top;
    box.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
  };

  useEffect(() => {
    const id = window.setInterval(keepLineOnTop, 300); // auch wenn keine Positionsmeldungen kommen (Ende, Pause)
    return () => window.clearInterval(id);
  }, []);

  /** Lied-ms zu einer Stream-Zeit (Anschlag) bzw. jetzt. */
  const songMsAtStream = (streamMs: number) => {
    const p = pos.current;
    const dt = p.advancing ? Math.max(-1000, Math.min(streamMs - p.streamMs, EXTRAPOLATE_MAX_MS)) : 0;
    return tickToMs(timeline.tempo, p.tick) + dt * speed;
  };
  const songMsNow = () => {
    const p = pos.current;
    const dt = p.advancing ? Math.min(performance.now() - p.perf, EXTRAPOLATE_MAX_MS) : 0;
    return tickToMs(timeline.tempo, p.tick) + dt * speed;
  };

  const commit = (next: SongPlayState, played?: NoteEvent) => {
    const prev = stateRef.current;
    if (next === prev) return;
    stateRef.current = next;
    setState(next);
    // Warte-Modus: gespielte Noten im Kern freigeben (auch vorzeitig gespielte)
    if (mode === "songWait" && next.cursor !== prev.cursor) api.songSetReleased(pos.current.pass, next.cursor);
    const fb = next.last;
    if (!fb || fb === prev.last) return;
    const base = { expectedMidi: fb.beat.midis[0], string: -1, fret: -1, bar: fb.beat.bar };
    if (fb.kind === "hit") {
      record({ ...base, playedMidi: played?.midi ?? fb.beat.midis[0], cents: played?.cents,
               timingMs: mode === "songPlay" ? fb.errorMs : undefined,
               reactionMs: mode === "songWait" ? fb.errorMs : undefined,
               onsetType: played?.onsetType, correct: true, levelDb: played?.levelDb, noteTimeMs: played?.timeMs });
    } else if (fb.kind === "wrong") {
      record({ ...base, playedMidi: fb.played, cents: played?.cents, onsetType: played?.onsetType, correct: false,
               noteTimeMs: played?.timeMs });
    } else {
      record({ ...base, correct: false });
    }
  };

  // ---------- alphaTab: Noten/Tab mit Cursor; Zeitachse kommt vom Kern (externe Wiedergabe)
  useEffect(() => {
    if (!host.current || !scroller.current) return;
    const s = new Settings();
    s.core.fontDirectory = new URL("font/", document.baseURI).href;
    s.display.scale = 0.9;
    s.player.playerMode = PlayerMode.EnabledExternalMedia;
    s.player.scrollElement = scroller.current;
    s.player.scrollMode = ScrollMode.Off; // eigenes Autoscroll (Zeile oben), siehe keepLineOnTop
    s.player.enableCursor = true;
    s.player.enableUserInteraction = false;
    const at = new AlphaTabApi(host.current, s);
    alpha.current = at;
    at.error.on((e) => {
      setError(e.message);
      setStatus("error");
    });
    // Lage der Takte für die Bereichsbalken (nach jedem Zeichnen, z. B. bei anderer Fensterbreite)
    at.postRenderFinished.on(() => {
      const lookup = at.boundsLookup;
      setBarRects(song.score.masterBars.map((_, i) => {
        const b = lookup?.findMasterBarByIndex(i)?.lineAlignedBounds;
        return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : undefined;
      }));
    });
    at.playerReady.on(() => {
      const out = (at.player as unknown as { output?: ExternalOutput } | null)?.output;
      if (!out) return;
      // alphaTab steuert nichts selbst: Start, Pause und Sprünge macht der Kern
      out.handler = {
        backingTrackDuration: timeline.endMs + 60000, playbackRate: 1, masterVolume: 1,
        seekTo() {}, play() {}, pause() {},
      };
      cursorOut.current = out;
      out.updatePosition(timeline.startMs);
    });
    at.load(song.score, [track]);
    return () => {
      at.destroy();
      alpha.current = null;
      cursorOut.current = null;
    };
  }, []);

  // ---------- Kern: Lied laden, Bereich/Tempo/Modus, Positionsmeldungen
  useEffect(() => {
    let alive = true;
    api.songLoad(coreSong(song.score, timeline.beats.map((b) => b.tick))).then((r) => {
      if (!alive) return;
      if (!r.soundFont) {
        setError("Soundfont nicht geladen");
        setStatus("error");
        return;
      }
      api.songSetRange(timeline.startTick, timeline.endTick, settings.loop, settings.loopPasses);
      api.songSetSpeed(speed);
      api.songSetWaitMode(mode === "songWait");
      api.songSetMetronome(settings.metronome, metronomeGain);
      api.songSetChannelGains(channelGains(song.score, mix));
      loaded.current = true;
      setStatus((st) => (st === "loading" ? "ready" : st));
    });
    const off = api.onSongPosition((p: SongPosition) => {
      const prevPass = pos.current.pass;
      pos.current = { tick: p.tick, streamMs: p.streamMs, perf: performance.now(),
                      advancing: p.playing && !p.halted && !p.countIn, pass: p.pass, latencyMs: p.latencyMs };
      cursorOut.current?.updatePosition(tickToMs(timeline.tempo, p.tick));
      requestAnimationFrame(keepLineOnTop); // nach dem Neuzeichnen des Cursors
      if (p.pass !== prevPass) commit(restartPass(stateRef.current)); // Wiederholen: neuer Durchlauf
      const st = statusRef.current;
      // Nach Stop/Pause (oder vor dem Start) bestimmt nur der Knopf den Zustand: eine Meldung, die vor dem
      // Anhalten verschickt wurde, darf ihn nicht wieder auf „spielt“ setzen
      if (st === "loading" || st === "paused" || st === "ready") return;
      if (p.finished) {
        if (st !== "done") setStatus("done");
      } else if (p.halted) {
        waitedSince.current ??= performance.now();
        if (st !== "waiting") setStatus("waiting");
      } else if (p.playing) {
        waitedSince.current = null;
        const next = p.countIn ? "countIn" : "playing";
        if (st !== next) setStatus(next);
      }
    });
    return () => {
      alive = false;
      off();
      api.songPause();
    };
  }, []);

  useEffect(() => {
    if (loaded.current) api.songSetChannelGains(channelGains(song.score, mix));
  }, [mixKey]);

  // Metronom an/aus und Lautstärke (auch des Vorzählers) wirken sofort
  useEffect(() => {
    if (loaded.current) api.songSetMetronome(settings.metronome, metronomeGain);
  }, [settings.metronome, metronomeGain]);

  // Bereich/Wiederholen geändert (Balken, Buttons): Kern und Bewertung übernehmen, ohne neu zu laden.
  // Steht die Wiedergabe außerhalb des neuen Bereichs, springt sie an dessen Anfang.
  const rangeKey = `${settings.barFrom}:${settings.barTo}:${settings.loop}:${settings.loopPasses}`;
  const appliedRange = useRef(rangeKey);
  useEffect(() => {
    if (appliedRange.current === rangeKey || !loaded.current) return;
    appliedRange.current = rangeKey;
    api.songSetRange(timeline.startTick, timeline.endTick, settings.loop, settings.loopPasses);
    api.songSetHalts(timeline.beats.map((b) => b.tick));
    const tick = pos.current.tick;
    const inside = tick >= timeline.startTick && tick < timeline.endTick;
    const fresh = startSongPlay(timeline.beats);
    const at = inside ? fresh.beats.findIndex((b) => b.tick >= tick) : 0;
    const next: SongPlayState = { ...fresh, cursor: at < 0 ? fresh.beats.length : at, stats: stateRef.current.stats, last: null };
    stateRef.current = next;
    setState(next);
    api.songSetReleased(inside ? pos.current.pass : 0, next.cursor);
    if (!inside || !pos.current.advancing) cursorOut.current?.updatePosition(timeline.startMs);
    if (statusRef.current === "done") setStatus("ready");
  }, [rangeKey]);

  // Spurwechsel im Mischpult: nur Notenbild und erwartete Noten wechseln, die Wiedergabe läuft weiter.
  // Bewertet wird ab der aktuellen Position; die Bilanz des Durchgangs bleibt.
  const shownTrack = useRef(track);
  useEffect(() => {
    if (shownTrack.current === track) return;
    shownTrack.current = track;
    alpha.current?.renderTracks([song.score.tracks[track]]);
    lastLineTop.current = null;
    const fresh = startSongPlay(timeline.beats);
    const at = fresh.beats.findIndex((b) => b.tick >= pos.current.tick);
    const next: SongPlayState = { ...fresh, cursor: at < 0 ? fresh.beats.length : at, stats: stateRef.current.stats, last: null };
    stateRef.current = next;
    setState(next);
    api.songSetHalts(timeline.beats.map((b) => b.tick));
    api.songSetReleased(pos.current.pass, next.cursor);
  }, [track]);

  // ---------- Erkannte Töne
  useEffect(() => {
    const playable = playableRange(tuned);
    const levels = new LevelReference();
    const off = api.onNote((note) => {
      const st = statusRef.current;
      if (st !== "playing" && st !== "waiting") return;
      const s = stateRef.current;
      // Anschlag auf der Liedzeit: Ein- und Ausgangslatenz des Geräts plus eigener Ausgleich
      const songMs = songMsAtStream(note.timeMs - pos.current.latencyMs - timing.offsetMs);
      const near = nearBeats(s, songMs, tolerance);
      const cur = s.beats[s.cursor];
      const isTarget = near.some((b) => b.midis.includes(note.midi)) || (mode === "songWait" && !!cur?.midis.includes(note.midi));
      if (ignoredNote(note, isTarget ? note.midi : undefined, playable, levels.value())) return;
      levels.add(note);

      const rating = isTarget ? dyn.rate(note, note.midi) : undefined;
      let next: SongPlayState;
      if (mode === "songPlay") {
        next = onSongPlayed(s, songMs, note.midi, tolerance, speed, difficulty, dynamicsFactor(rating));
      } else {
        if (!cur) return;
        const waiting = st === "waiting";
        // vor dem Halt: nur die erwartete Note, höchstens ein Viertel zu früh; Fehler nur, wenn eine Note fällig ist
        if (!waiting && (!cur.midis.includes(note.midi) || cur.ms - songMs > cur.quarterMs)) {
          if (cur.ms - songMs <= cur.quarterMs && near.length > 0) next = onSongWaitPlayed(s, note.midi, 0, difficulty);
          else return;
        } else {
          const waited = waiting && waitedSince.current !== null ? performance.now() - waitedSince.current : 0;
          next = onSongWaitPlayed(s, note.midi, waited, difficulty, dynamicsFactor(rating));
        }
      }
      if (next.last?.kind === "hit" && next.last !== s.last) dyn.hit(note, rating);
      commit(next, note);
    });
    return off;
  }, []);

  // ---------- Mitspielen: verpasste Noten abschließen
  useEffect(() => {
    if (mode !== "songPlay") return;
    let raf = 0;
    const loop = () => {
      if (statusRef.current === "playing") commit(expireSong(stateRef.current, songMsNow() - EXPIRE_LAG_MS * speed, tolerance));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Nur in der Vorschau: Wann ist die nächste offene Note fällig (echte ms)? Für Tests mit __mockPlay.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__songDueIn = () => {
      const s = stateRef.current;
      const b = s.beats[s.cursor];
      return b ? { midi: b.midis[0], inMs: (b.ms - songMsNow()) / speed } : null;
    };
    return () => void delete (window as any).__songDueIn;
  }, []);

  // Erwartete Note an den Kern melden (Oktavprüfung)
  const current = state.beats[state.cursor];
  useEffect(() => {
    const midis = current ? current.midis : [];
    api.setExpectedNotes(midis);
    logTargets(midis);
  }, [current]);
  useEffect(() => () => void api.setExpectedNotes([]), []);

  const start = () => {
    if (statusRef.current === "done") commit(restartPass(stateRef.current)); // Nochmal von vorn
    api.songPlay(mode === "songPlay"); // Vorzähler beim Mitspielen
    setStatus(mode === "songPlay" ? "countIn" : "playing");
  };
  const pause = () => {
    api.songPause();
    pos.current = { ...pos.current, advancing: false };
    setStatus("paused");
  };

  // Springen (Stop, Takt zurück/vor): Kern an die Stelle setzen, Bewertung ab dort, Cursor sofort mit
  const lastJump = useRef<{ tick: number; at: number } | null>(null);
  const jumpTo = (tick: number) => {
    api.songSeek(tick);
    pos.current = { ...pos.current, tick, perf: performance.now() };
    lastJump.current = { tick, at: performance.now() };
    const fresh = startSongPlay(timeline.beats);
    const i = fresh.beats.findIndex((b) => b.tick >= tick);
    const next: SongPlayState = { ...fresh, cursor: i < 0 ? fresh.beats.length : i, stats: stateRef.current.stats, last: null };
    stateRef.current = next;
    setState(next);
    api.songSetReleased(pos.current.pass, next.cursor);
    waitedSince.current = null;
    cursorOut.current?.updatePosition(tickToMs(timeline.tempo, tick));
    lastLineTop.current = null;
  };
  /** Mehrere schnelle Klicks summieren sich (Bezug: letztes Sprungziel statt der noch alten Position). */
  const stepBars = (steps: number) => {
    const recent = lastJump.current && performance.now() - lastJump.current.at < 1500;
    jumpTo(barJump(timeline.barStarts, recent ? lastJump.current!.tick : pos.current.tick, steps));
  };
  const stop = () => {
    api.songPause();
    pos.current = { ...pos.current, advancing: false };
    jumpTo(timeline.startTick);
    setStatus("ready");
  };

  const { stats, last } = state;
  const summary = timingSummary(stats.timingErrorsMs);
  const total = stats.hits + stats.misses;

  return (
    <>
      <section className="card wide-card song-stage" data-target={current?.midis[0]} data-status={status}>
        <div className="song-controls">
          {(status === "ready" || status === "paused" || status === "done") && (
            <button className="primary" onClick={start}>{status === "done" ? "↺ Nochmal" : "▶ Wiedergabe"}</button>
          )}
          {(status === "playing" || status === "waiting" || status === "countIn") && <button onClick={pause}>❚❚ Pause</button>}
          {status !== "loading" && status !== "error" && (
            <>
              <button onClick={stop} title="Wiedergabe beenden und an den Anfang des Bereichs">■ Stop</button>
              <button onClick={() => stepBars(-1)} title="Einen Takt zurück (mehrfach klicken = mehrere Takte)">◀ Takt</button>
              <button onClick={() => stepBars(1)} title="Einen Takt vor (mehrfach klicken = mehrere Takte)">Takt ▶</button>
            </>
          )}
          <span className="hint">
            {status === "loading" && "Lied wird geladen …"}
            {status === "countIn" && "Vorzähler … "}
            {status === "waiting" && current && `Wartet auf ${formatName(Math.min(...current.midis), current.flat)}`}
            {status === "done" && `Ende – ${stats.hits} Treffer, ${stats.misses} Fehler.`}
            {status !== "loading" && ` ${mode === "songPlay" ? "Mitspielen" : "Wartet auf dich"} · ${settings.tempoPercent} %`}
            {status !== "loading" && current && ` · Takt ${current.bar + 1}`}
          </span>
          {error && <span className="bad">Wiedergabe nicht möglich: {error}</span>}
        </div>
        <div className="song-controls range-controls">
          <button className={`range-button start ${placing === "start" ? "on" : ""}`}
                  title="Danach in die Noten zeigen: der grüne Balken folgt dem Mauszeiger, Klick setzt ihn (Esc bricht ab)"
                  onClick={() => setPlacing(placing === "start" ? null : "start")}>Start setzen</button>
          <button className={`range-button end ${placing === "end" ? "on" : ""}`}
                  title="Danach in die Noten zeigen: der rote Balken folgt dem Mauszeiger, Klick setzt ihn (Esc bricht ab)"
                  onClick={() => setPlacing(placing === "end" ? null : "end")}>Ende setzen</button>
          <span className="hint">Takt {settings.barFrom + 1}–{rangeTo + 1}</span>
          {(settings.barFrom > 0 || settings.barTo >= 0) && (
            <button onClick={() => setRange(0, lastBar)} title="Ganzes Lied">Ganzes Lied</button>
          )}
          <label>
            <input type="checkbox" checked={settings.loop} onChange={(e) => onSongChange({ ...settings, loop: e.target.checked })} />
            <span>Wiederholen</span>
          </label>
          {settings.loop && (
            <label title="So oft wird der Bereich gespielt">
              <select value={settings.loopPasses} onChange={(e) => onSongChange({ ...settings, loopPasses: Number(e.target.value) })}>
                {LOOP_PASSES.map((n) => <option key={n} value={n}>{n === 0 ? "endlos" : `${n}×`}</option>)}
              </select>
              {status !== "loading" && pos.current.pass > 0 && <span className="hint">Durchlauf {pos.current.pass + 1}</span>}
            </label>
          )}
          {placing && <span className="hint">{placing === "start" ? "Grünen" : "Roten"} Balken in den Noten setzen (Esc bricht ab)</span>}
        </div>
        <div className="song-score" ref={scroller}>
          <div className={`song-sheet ${placing ? "placing" : ""}`} ref={sheet}>
            <div ref={host} />
            <RangeMarkers sheet={sheet} rects={barRects} from={settings.barFrom} to={rangeTo} placing={placing}
                          onPlaced={() => setPlacing(null)} onChange={setRange} />
          </div>
        </div>
        <TrackMixer tracks={song.score.tracks} mix={mix} selected={track} onChange={setMix}
                    onSelect={(i) => i !== track && onSongChange({ ...settings, track: i })} />
        <div className="practice-feedback" aria-live="polite">
          {last?.kind === "hit" && (
            <span className="ok">
              {formatName(last.beat.midis[0], last.beat.flat)}
              {mode === "songPlay" && ` · ${Math.abs(last.errorMs) < 15 ? "genau" : `${Math.round(Math.abs(last.errorMs))} ms ${last.errorMs < 0 ? "zu früh" : "zu spät"}`}`}
              {` · +${last.points}`}
            </span>
          )}
          {last?.kind === "hit" && dyn.on && <LevelBadge rating={dyn.last} windowDb={dyn.windowDb} />}
          {last?.kind === "wrong" && <span className="bad">Gespielt: {formatName(last.played)}</span>}
          {last?.kind === "missed" && <span className="bad">Verpasst: {formatName(last.beat.midis[0], last.beat.flat)}</span>}
        </div>
      </section>

      <section className="card wide-card">
        <div className="result-stats">
          <div className="accuracy good"><span>Punkte</span>{stats.score}</div>
          <div><span>Treffer</span>{stats.hits}</div>
          <div><span>Fehler</span>{stats.misses}</div>
          <div><span>Quote</span>{total > 0 ? Math.round((stats.hits / total) * 100) : 0} %</div>
          {mode === "songPlay" && (
            <>
              <div><span>Ø Abweichung</span>{stats.hits > 0 ? `${Math.round(summary.absMeanMs)} ms` : "–"}</div>
              <div>
                <span>Tendenz</span>
                {stats.hits >= 4 ? (Math.abs(summary.meanMs) < 15 ? "genau" : `${Math.round(Math.abs(summary.meanMs))} ms ${summary.meanMs < 0 ? "zu früh" : "zu spät"}`) : "–"}
              </div>
            </>
          )}
          <div><span>Serie</span>{stats.streak}</div>
          <div><span>Beste Serie</span>{stats.bestStreak}</div>
          {dyn.on && <DynamicsStats summary={dyn.summary} />}
        </div>
        <p className="hint">
          {timeline.beats.length} Noten im Bereich · Fenster ±{tolerance} Viertel · Wiedergabe über das Audio-Gerät der App
          (Latenz des Treibers wird ausgeglichen; bleibt eine Tendenz, den Timing-Ausgleich anpassen).
        </p>
      </section>
    </>
  );
}

/** Offene Noten, deren Fenster songMs enthält. */
function nearBeats(s: SongPlayState, songMs: number, toleranceBeats: number): SongBeat[] {
  const out: SongBeat[] = [];
  for (let i = s.cursor; i < s.beats.length; i++) {
    const b = s.beats[i];
    const win = toleranceBeats * b.quarterMs;
    if (b.ms - win > songMs) break;
    if (!s.results[i] && Math.abs(songMs - b.ms) <= win) out.push(b);
  }
  return out;
}

/** Spuren des Lieds wie im Mischpult von Guitar Pro: Name (Klick = diese Spur üben und anzeigen),
    Stumm, Solo, Lautstärke. */
function TrackMixer({ tracks, mix, selected, onChange, onSelect }: {
  tracks: Track[];
  mix: TrackMix[];
  selected: number;
  onChange: (i: number, patch: Partial<TrackMix>) => void;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="track-mixer" role="group" aria-label="Spuren">
      {tracks.map((t, i) => {
        const m = mix[i];
        const staff = t.staves[0];
        const playable = staff.isStringed && !staff.isPercussion;
        return (
          <div key={i} className={`mixer-row ${i === selected ? "selected" : ""} ${m.mute ? "muted" : ""}`}>
            <button className="mixer-name" disabled={!playable || i === selected}
                    title={playable ? (i === selected ? "Diese Spur übst du" : "Diese Spur üben und als Noten/Tab anzeigen") : "Keine Saitenspur"}
                    onClick={() => onSelect(i)}>
              {i === selected ? "▶ " : ""}{t.name || `Spur ${i + 1}`}
            </button>
            <button className={`mixer-toggle ${m.mute ? "on" : ""}`} aria-pressed={m.mute} title="Stumm"
                    onClick={() => onChange(i, { mute: !m.mute })}>M</button>
            <button className={`mixer-toggle ${m.solo ? "on" : ""}`} aria-pressed={m.solo} title="Solo"
                    onClick={() => onChange(i, { solo: !m.solo })}>S</button>
            <input type="range" min={0} max={MAX_TRACK_VOLUME} step={0.05} value={m.volume} aria-label={`Lautstärke ${t.name}`}
                   onChange={(e) => onChange(i, { volume: Number(e.target.value) })} />
            <span className="hint mixer-value">{Math.round(m.volume * 100)} %</span>
          </div>
        );
      })}
    </div>
  );
}
