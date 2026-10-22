// Typisierte Bridge-API (SPEC Abschnitt 9, Phase-1-Teilmenge).

import { callNative, onEvent } from "./juce";

export interface DeviceType {
  name: string;
  inputs: string[];
  outputs: string[];
  separateInputsAndOutputs: boolean;
}

export interface DeviceConfig {
  type: string;
  inputDevice: string;
  outputDevice: string;
  sampleRate: number;
  bufferSize: number;
  inputChannel: number;
}

export interface DeviceInfo {
  types: DeviceType[];
  current: DeviceConfig;
  inputChannels: string[];
  sampleRates: number[];
  bufferSizes: number[];
  latencyMs?: number;
  error: string;
}

export interface NoiseGateParams {
  thresholdDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
  hysteresisDb: number;
}

export interface DetectionConfig {
  minHz: number;
  maxHz: number;
  centsTolerance: number;
}

export interface AppSettings {
  instrument: string;
  inputGainDb: number;
  monitoring: { on: boolean; volumeDb: number };
  noiseGate: NoiseGateParams;
  detection: DetectionConfig;
}

export interface LevelEvent {
  rmsDb: number;
  peakDb: number;
  gateOpen: boolean;
}

/** hz = 0 und midi = -1: kein (stimmhafter) Ton */
export interface PitchEvent {
  hz: number;
  midi: number;
  cents: number;
  confidence: number;
}

/** timeMs auf derselben Stream-Uhr wie NoteEvent.timeMs; latencyMs = Ein- + Ausgangslatenz */
export interface BeatEvent {
  index: number;
  timeMs: number;
  accent: boolean;
  latencyMs: number;
}

export interface NoteEvent {
  midi: number;
  cents: number;
  timeMs: number;
  onsetType: "pick" | "legato";
  corrected?: boolean; // anhand des erwarteten Tons korrigiert (Oktave, mitklingende Saite)
  levelDb?: number; // Spitzenpegel der Note (dBFS)
  riseDb?: number; // Anstieg gegenüber dem Pegel davor
}

export interface DetectionTuning {
  minRiseDb: number;
  strongFluxFactor: number;
  fluxMultiplier: number;
  stableFrames: number;
  legatoFrames: number;
}

export type AlignKind = "correct" | "wrongType" | "wrongPitch" | "missing" | "extra";

export interface TakeScore {
  accuracy: number;
  expected: number;
  correct: number;
  wrongType: number;
  wrongPitch: number;
  missing: number;
  extra: number;
  alignment: { kind: AlignKind; expected: number; detected: number }[];
  detected: NoteEvent[];
}

export interface CalibrationTake {
  id: string;
  instrument: string;
  exerciseId: string;
  title: string;
  kind: "notes" | "silence";
  level: number;
  createdAt: string;
  durationSec: number;
  minHz: number;
  maxHz: number;
  expected: { midi: number; type: "pick" | "legato" }[];
  score?: TakeScore;
  noise?: { peakDb: number; typicalPeakDb?: number; rmsDb: number; suggestedGateDb: number; quiet?: boolean };
  peakDb?: number;
  missingFile?: boolean;
  error?: string;
}

export interface CalibrationState {
  takes: CalibrationTake[];
  instrument: string;
  tuning: DetectionTuning;
  defaultTuning: DetectionTuning;
  busy: boolean;
}

export interface TuningEvaluation {
  tuning: DetectionTuning;
  totalCost: number;
  takes: { id: string; accuracy: number }[];
}

export interface OptimizeResult {
  combinations: number;
  current: TuningEvaluation;
  best: TuningEvaluation;
  error?: string;
}

export interface SaveTakeInfo {
  instrument: string;
  exerciseId: string;
  title: string;
  kind: "notes" | "silence";
  level: number;
  minHz: number;
  maxHz: number;
  notes: { midi: number; type: "pick" | "legato" }[];
}

export interface NoteStatRow {
  midi: number;
  string: number;
  fret: number;
  attempts: number;
  hits: number;
  avgReactionMs: number;
  avgTimingAbsMs: number;
  lastPracticed: string;
}

export interface SessionRow {
  id: number;
  startedAt: string;
  difficulty: string;
  mode: string;
  tempo: string;
  bpm: number;
  durationSec: number;
  score: number;
  hits: number;
  misses: number;
  avgReactionMs: number;
  avgTimingAbsMs: number;
  dynamicsWindowDb?: number; // nur mit Lautstärke-Bewertung
  source?: string; // "random" | "gp"
  gpFile?: string; // Liedname
  levelRated?: number;
  levelInWindowRate?: number;
  levelSpreadDb?: number;
}

export interface StatsData {
  notes: NoteStatRow[];
  sessions: SessionRow[];
  confusions: { expectedMidi: number; playedMidi: number; count: number }[];
  levels?: { midi: number; avgDevDb: number; count: number }[]; // Ø Lautstärke-Abweichung je Ton
  error?: string;
}

/** Position der Liedwiedergabe im Kern; tick galt zur Stream-Zeit streamMs. */
export interface SongPosition {
  tick: number;
  streamMs: number;
  playing: boolean;
  halted: boolean; // Warte-Modus: hält an einer Note
  countIn: boolean;
  finished: boolean;
  pass: number; // Durchlauf beim Wiederholen
  released: number;
  latencyMs: number; // Ein- plus Ausgangslatenz des Geräts
}

export interface SoundFontInfo {
  name: string;
  path: string;
  builtin: boolean;
}

export interface SongFile {
  path: string;
  name: string;
  data?: string; // Base64
  error?: string;
}

export interface AttemptRecord {
  expectedMidi: number;
  string: number;
  fret: number;
  playedMidi?: number;
  cents?: number;
  reactionMs?: number;
  timingMs?: number;
  onsetType?: string;
  correct: boolean;
  noteTimeMs?: number; // Stream-Zeit des gewerteten Tons (nur für die Diagnose-Aufnahme)
  levelDb?: number; // Pegel des Treffers
  levelDevDb?: number; // Abweichung vom Bezug (nur mit Lautstärke-Bewertung)
  bar?: number; // Takt im Lied (0-basiert)
}

export interface BarStat {
  bar: number;
  attempts: number;
  hits: number;
}

export const api = {
  getAudioDevices: () => callNative<DeviceInfo>("getAudioDevices"),
  setAudioDevice: (cfg: Partial<DeviceConfig>) => callNative<DeviceInfo>("setAudioDevice", cfg),
  setInputGain: (db: number) => callNative<void>("setInputGain", db),
  setMonitoring: (on: boolean, volumeDb: number) => callNative<void>("setMonitoring", on, volumeDb),
  setNoiseGate: (p: NoiseGateParams) => callNative<void>("setNoiseGate", p),
  setDetectionConfig: (c: DetectionConfig) => callNative<void>("setDetectionConfig", c),
  getSettings: () => callNative<AppSettings>("getSettings"),
  getUiSettings: () => callNative<Record<string, unknown>>("getUiSettings"),
  setUiSetting: (key: string, value: unknown) => callNative<void>("setUiSetting", key, value),
  setInstrument: (id: string, minHz: number, maxHz: number) => callNative<AppSettings>("setInstrument", { id, minHz, maxHz }),
  onLevel: (fn: (e: LevelEvent) => void) => onEvent<LevelEvent>("level", fn),
  onPitch: (fn: (e: PitchEvent) => void) => onEvent<PitchEvent>("pitch", fn),
  onNote: (fn: (e: NoteEvent) => void) => onEvent<NoteEvent>("note", fn),
  onBeat: (fn: (e: BeatEvent) => void) => onEvent<BeatEvent>("beat", fn),
  setExpectedNotes: (midis: number[]) => callNative<void>("setExpectedNotes", midis),
  statsStartSession: (s: { instrument: string; difficulty: string; mode: string; tempo: string; bpm: number;
                           dynamicsWindowDb?: number; source?: string; gpFile?: string; gpTrack?: number }) =>
    callNative<{ id?: number; error?: string }>("statsStartSession", s),
  statsAddAttempt: (sessionId: number, a: AttemptRecord) => callNative<void>("statsAddAttempt", sessionId, a),
  statsEndSession: (sessionId: number, r: { score: number; durationSec: number }) => callNative<void>("statsEndSession", sessionId, r),
  getStats: (instrument: string) => callNative<StatsData>("getStats", instrument),
  getSongStats: (instrument: string, gpFile: string, gpTrack: number) =>
    callNative<{ bars?: BarStat[]; error?: string }>("getSongStats", instrument, gpFile, gpTrack),
  clearStats: (instrument: string) => callNative<void>("clearStats", instrument),
  setMetronome: (m: { on: boolean; bpm: number; volumeDb: number; beatsPerBar: number }) => callNative<void>("setMetronome", m),

  startRecording: (sessionId: string, maxSec?: number) => callNative<boolean>("startRecording", sessionId, maxSec),
  stopRecording: () => callNative<{ durationSec: number; truncated: boolean }>("stopRecording"),
  songLoad: (song: { ppq: number; tempo: [number, number][]; events: [number, number, number, number][]; halts: number[] }) =>
    callNative<{ soundFont: boolean }>("songLoad", song),
  songSetHalts: (ticks: number[]) => callNative<void>("songSetHalts", ticks),
  songPlay: (withCountIn: boolean) => callNative<void>("songPlay", withCountIn),
  songPause: () => callNative<void>("songPause"),
  songSeek: (tick: number) => callNative<void>("songSeek", tick),
  songSetSpeed: (factor: number) => callNative<void>("songSetSpeed", factor),
  songSetRange: (startTick: number, endTick: number, loop: boolean, passes = 0) =>
    callNative<void>("songSetRange", startTick, endTick, loop, passes),
  songSetChannelGains: (gains: number[]) => callNative<void>("songSetChannelGains", gains),
  songSetMetronome: (on: boolean, gain: number) => callNative<void>("songSetMetronome", on, gain),
  songSetWaitMode: (on: boolean) => callNative<void>("songSetWaitMode", on),
  songSetReleased: (pass: number, n: number) => callNative<void>("songSetReleased", pass, n),
  onSongPosition: (fn: (p: SongPosition) => void) => onEvent<SongPosition>("songPosition", fn),
  getSoundFont: () => callNative<SoundFontInfo>("getSoundFont"),
  chooseSoundFont: () => callNative<SoundFontInfo | { error: string } | null>("chooseSoundFont"),
  resetSoundFont: () => callNative<SoundFontInfo>("resetSoundFont"),
  getStreamTime: () => callNative<{ streamMs: number; inputLatencyMs: number }>("getStreamTime"),
  openSongFile: (startDir?: string) => callNative<SongFile | null>("openSongFile", startDir ?? ""),
  readSongFile: (path: string) => callNative<SongFile | null>("readSongFile", path),
  saveDiagnostic: (log: unknown) => callNative<{ path?: string; error?: string }>("saveDiagnostic", log),
  getCalibration: () => callNative<CalibrationState>("getCalibration"),
  saveCalibrationTake: (info: SaveTakeInfo) => callNative<CalibrationTake>("saveCalibrationTake", info),
  deleteCalibrationTake: (id: string) => callNative<boolean>("deleteCalibrationTake", id),
  optimizeCalibration: () => callNative<OptimizeResult>("optimizeCalibration"),
  setDetectionTuning: (t: DetectionTuning | null) => callNative<CalibrationState>("setDetectionTuning", t),
  onCalibrationProgress: (fn: (e: { progress: number }) => void) => onEvent("calibrationProgress", fn),
  onCalibrationUpdated: (fn: () => void) => onEvent("calibrationUpdated", fn),
};

export { noteName } from "./music/names";
