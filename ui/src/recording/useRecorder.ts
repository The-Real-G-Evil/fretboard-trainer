// Aufnahme steuern: Kern (Audiodateien, MIDI-Ausgang) starten und stoppen, dabei erkannte Töne und
// Metronomschläge sammeln und daraus nach dem Stoppen die Guitar-Pro-Datei(en) erzeugen.
// Lebt in App (oberhalb der Seiten), damit Seitenwechsel und Sprachwechsel die Aufnahme nicht beenden.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t, tCore } from "../i18n";
import type { Instrument } from "../instruments";
import { beatTimeline, estimateTempo, freeTimeline, quantize, toAlphaTex, type HeardBeat, type PlayedNote } from "./score";
import type { RecordingSettings } from "./settings";

export type RecorderPhase = "idle" | "starting" | "recording" | "saving";

export interface RecorderResult {
  files: string[];
  errors: string[];
  seconds: number;
}

export interface Recorder {
  phase: RecorderPhase;
  startedAt: number; // performance.now() beim Start
  result: RecorderResult | null;
  error: string;
  start: () => void;
  stop: () => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Guitar-Pro-Dateien aus den gesammelten Tönen; liefert Pfade und Fehler. */
async function saveScores(r: RecordingSettings, notes: PlayedNote[], beats: HeardBeat[], inst: Instrument, base: string) {
  const files: string[] = [];
  const errors: string[] = [];
  if (!notes.length) return { files, errors: [t("Keine Töne erkannt – keine Guitar-Pro-Datei.")] };

  const both = r.gpMetronome && r.gpFree;
  const variants: { variant: string; bpm: number; timeline: ReturnType<typeof freeTimeline> }[] = [];
  if (r.gpMetronome) {
    const tl = beatTimeline(beats, notes[0].startMs, r.steps);
    if (tl) variants.push({ variant: both ? ` (${t("Metronom|Dateiname")})` : "", bpm: r.bpm, timeline: tl });
    else errors.push(t("Keine Metronomschläge empfangen – Ausrichtung am Metronom nicht möglich."));
  }
  if (r.gpFree) {
    const bpm = estimateTempo(notes.map((n) => n.startMs));
    variants.push({ variant: both ? ` (${t("frei")})` : "", bpm, timeline: freeTimeline(notes[0].startMs, bpm, r.steps) });
  }

  const gp = await import("../song/gpImport");
  for (const v of variants) {
    try {
      const tex = toAlphaTex(quantize(notes, v.timeline), inst, v.bpm,
        { beatsPerBar: r.beatsPerBar, steps: r.steps, title: base, track: inst.name });
      const res = await api.saveRecordingScore(v.variant, bytesToBase64(gp.alphaTexToGp(tex)));
      if (res.path) files.push(res.path);
      else errors.push(tCore(res.error ?? ""));
    } catch (e) {
      errors.push(t("Guitar-Pro-Datei nicht erstellt: {error}", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { files, errors };
}

/** settings: aktuelle Aufnahme-Einstellungen; offsetMs: eigener Timing-Ausgleich (wie beim Üben). */
export function useRecorder(settings: RecordingSettings | null, instrument: Instrument, offsetMs: number): Recorder {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<RecorderResult | null>(null);
  const [error, setError] = useState("");
  const run = useRef<{ r: RecordingSettings; inst: Instrument; base: string; notes: PlayedNote[]; beats: HeardBeat[]; metronome: boolean } | null>(null);

  // Während der Aufnahme Töne, Notenenden und Schläge sammeln (nur für Guitar Pro nötig)
  useEffect(() => {
    if (phase !== "recording" || !run.current?.r.gp) return;
    const cur = run.current;
    const offs = [
      api.onNote((e) => cur.notes.push({ midi: e.midi, startMs: e.timeMs, legato: e.onsetType === "legato" })),
      api.onNoteOff((e) => {
        const last = cur.notes[cur.notes.length - 1];
        if (last && last.endMs === undefined && e.timeMs > last.startMs) last.endMs = e.timeMs;
      }),
      // gehört wird der Klick nach der Latenz; der eigene Ausgleich verschiebt wie beim Üben
      api.onBeat((b) => cur.beats.push({ timeMs: b.timeMs + b.latencyMs + offsetMs, accent: b.accent })),
    ];
    return () => offs.forEach((off) => off());
  }, [phase, offsetMs]);

  const start = async () => {
    if (!settings || phase !== "idle") return;
    setPhase("starting");
    setError("");
    setResult(null);
    const r = settings;
    const res = await api.startCapture({
      dry: r.dry, wet: r.wet, formats: r.formats, kbps: r.kbps,
      midi: r.midi && r.midiId ? { id: r.midiId, channel: r.midiChannel } : null,
    });
    if (res.error || !res.base) {
      setError(tCore(res.error ?? ""));
      setPhase("idle");
      return;
    }
    const metronome = r.gp && r.gpMetronome;
    if (metronome) api.setMetronome({ on: true, bpm: r.bpm, volumeDb: r.volumeDb, beatsPerBar: r.beatsPerBar });
    run.current = { r, inst: instrument, base: res.base, notes: [], beats: [], metronome };
    setStartedAt(performance.now());
    setPhase("recording");
  };

  const stop = async () => {
    const cur = run.current;
    if (phase !== "recording" || !cur) return;
    setPhase("saving");
    if (cur.metronome) api.setMetronome({ on: false, bpm: cur.r.bpm, volumeDb: cur.r.volumeDb, beatsPerBar: cur.r.beatsPerBar });
    const audio = await api.stopCapture();
    const out: RecorderResult = { files: [...audio.files], errors: audio.errors.map(tCore), seconds: audio.seconds };
    if (cur.r.gp) {
      const scores = await saveScores(cur.r, cur.notes, cur.beats, cur.inst, cur.base);
      out.files.push(...scores.files);
      out.errors.push(...scores.errors);
    }
    if (!out.seconds) out.seconds = (performance.now() - startedAt) / 1000;
    run.current = null;
    setResult(out);
    setPhase("idle");
  };

  return { phase, startedAt, result, error, start: () => void start(), stop: () => void stop() };
}
