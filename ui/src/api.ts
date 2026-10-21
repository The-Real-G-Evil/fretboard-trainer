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

export interface NoteEvent {
  midi: number;
  cents: number;
  timeMs: number;
  onsetType: "pick" | "legato";
}

export const api = {
  getAudioDevices: () => callNative<DeviceInfo>("getAudioDevices"),
  setAudioDevice: (cfg: Partial<DeviceConfig>) => callNative<DeviceInfo>("setAudioDevice", cfg),
  setInputGain: (db: number) => callNative<void>("setInputGain", db),
  setMonitoring: (on: boolean, volumeDb: number) => callNative<void>("setMonitoring", on, volumeDb),
  setNoiseGate: (p: NoiseGateParams) => callNative<void>("setNoiseGate", p),
  setDetectionConfig: (c: DetectionConfig) => callNative<void>("setDetectionConfig", c),
  getSettings: () => callNative<AppSettings>("getSettings"),
  onLevel: (fn: (e: LevelEvent) => void) => onEvent<LevelEvent>("level", fn),
  onPitch: (fn: (e: PitchEvent) => void) => onEvent<PitchEvent>("pitch", fn),
  onNote: (fn: (e: NoteEvent) => void) => onEvent<NoteEvent>("note", fn),
};

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "H"];

/** Deutsche Notennamen (H statt B) mit wissenschaftlicher Oktavzahl, z. B. 40 -> "E2". */
export function noteName(midi: number) {
  const pc = ((midi % 12) + 12) % 12;
  return { name: NOTE_NAMES[pc], octave: Math.floor(midi / 12) - 1 };
}
