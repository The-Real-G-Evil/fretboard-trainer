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

export interface AppSettings {
  inputGainDb: number;
  monitoring: { on: boolean; volumeDb: number };
  noiseGate: NoiseGateParams;
}

export interface LevelEvent {
  rmsDb: number;
  peakDb: number;
  gateOpen: boolean;
}

export const api = {
  getAudioDevices: () => callNative<DeviceInfo>("getAudioDevices"),
  setAudioDevice: (cfg: Partial<DeviceConfig>) => callNative<DeviceInfo>("setAudioDevice", cfg),
  setInputGain: (db: number) => callNative<void>("setInputGain", db),
  setMonitoring: (on: boolean, volumeDb: number) => callNative<void>("setMonitoring", on, volumeDb),
  setNoiseGate: (p: NoiseGateParams) => callNative<void>("setNoiseGate", p),
  getSettings: () => callNative<AppSettings>("getSettings"),
  onLevel: (fn: (e: LevelEvent) => void) => onEvent<LevelEvent>("level", fn),
};
