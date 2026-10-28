// Einstellungen der Aufnahme (UI-Einstellung "recording").
import { api, type AudioFormat } from "../api";
import type { UiSettings } from "../practice/settings";
import type { Steps } from "./score";

export const AUDIO_FORMATS: { id: AudioFormat; name: string }[] = [
  { id: "wav", name: "WAV" },
  { id: "flac", name: "FLAC" },
  { id: "ogg", name: "Ogg Vorbis" },
  { id: "mp3", name: "MP3" },
];
export const BITRATES = [128, 192, 256, 320];

export interface RecordingSettings {
  formats: AudioFormat[];
  gp: boolean; // Guitar-Pro-Datei aus den erkannten Tönen
  midi: boolean; // live an ein MIDI-Gerät
  dry: boolean; // Signal direkt vom Instrument
  wet: boolean; // mit Effekten und Plugins (wie beim Mithören)
  kbps: number; // Ogg und MP3
  midiId: string;
  midiChannel: number;
  gpMetronome: boolean; // am Metronom ausrichten (Metronom läuft während der Aufnahme)
  gpFree: boolean; // Tempo aus dem Gespielten schätzen
  bpm: number;
  beatsPerBar: number;
  steps: Steps;
  volumeDb: number; // Metronom
}

const DEFAULTS: RecordingSettings = {
  formats: ["wav"], gp: false, midi: false, dry: true, wet: false, kbps: 256,
  midiId: "", midiChannel: 1, gpMetronome: true, gpFree: false, bpm: 90, beatsPerBar: 4, steps: 4, volumeDb: -12,
};

export function recordingOf(ui: UiSettings): RecordingSettings {
  const s = { ...DEFAULTS, ...((ui.recording ?? {}) as Partial<RecordingSettings>) };
  return {
    ...s,
    formats: AUDIO_FORMATS.map((f) => f.id).filter((id) => s.formats.includes(id)),
    kbps: BITRATES.includes(s.kbps) ? s.kbps : DEFAULTS.kbps,
    midiChannel: Math.min(16, Math.max(1, Math.round(Number(s.midiChannel) || 1))),
    bpm: Math.min(240, Math.max(30, Number(s.bpm) || DEFAULTS.bpm)),
    beatsPerBar: Math.min(7, Math.max(2, Math.round(Number(s.beatsPerBar) || 4))),
    steps: s.steps === 2 ? 2 : 4,
    volumeDb: Math.min(6, Math.max(-60, Number(s.volumeDb))),
  };
}

export function saveRecording(ui: UiSettings, r: RecordingSettings): UiSettings {
  api.setUiSetting("recording", r);
  return { ...ui, recording: r };
}

/** Was fehlt, damit aufgenommen werden kann (null = alles da). */
export function missingChoice(r: RecordingSettings): "target" | "signal" | "align" | "midi" | null {
  if (!r.formats.length && !r.gp && !r.midi) return "target";
  if (r.formats.length && !r.dry && !r.wet) return "signal";
  if (r.gp && !r.gpMetronome && !r.gpFree) return "align";
  if (r.midi && !r.midiId) return "midi";
  return null;
}
