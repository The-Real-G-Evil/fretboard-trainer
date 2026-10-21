// Ersatz-Backend fuer die UI-Entwicklung im normalen Browser (ohne JUCE).
// Simuliert Geraeteliste, Einstellungen, Pegel, Tonhoehe und Noten.

import type { JuceBackend } from "./juce";

export function createMockBackend(): JuceBackend {
  const listeners = new Map<string, Map<number, (p: any) => void>>();
  let nextId = 0;

  const state = {
    inputGainDb: 0,
    monitoring: { on: true, volumeDb: -6 },
    noiseGate: { thresholdDb: -50, attackMs: 1, holdMs: 50, releaseMs: 100, hysteresisDb: 6 },
    detection: { minHz: 55, maxHz: 1500, centsTolerance: 25 },
    device: {
      type: "Windows Audio",
      inputDevice: "Mock-Interface",
      outputDevice: "Mock-Interface",
      sampleRate: 48000,
      bufferSize: 128,
      inputChannel: 0,
    },
  };

  const emit = (eventId: string, payload: unknown) =>
    listeners.get(eventId)?.forEach((fn) => fn(payload));

  const deviceInfo = () => ({
    types: [
      { name: "Windows Audio", inputs: ["Mock-Interface", "Mikrofon"], outputs: ["Mock-Interface", "Lautsprecher"], separateInputsAndOutputs: true },
      { name: "ASIO", inputs: ["Mock ASIO"], outputs: ["Mock ASIO"], separateInputsAndOutputs: false },
    ],
    current: state.device,
    inputChannels: ["Input 1", "Input 2"],
    sampleRates: [44100, 48000, 96000],
    bufferSizes: [32, 64, 128, 256, 512],
    latencyMs: (2 * state.device.bufferSize * 1000) / state.device.sampleRate,
    error: "",
  });

  const functions: Record<string, (...args: any[]) => unknown> = {
    getAudioDevices: () => deviceInfo(),
    setAudioDevice: (cfg) => {
      state.device = { ...state.device, ...cfg };
      return deviceInfo();
    },
    setInputGain: (db) => void (state.inputGainDb = db),
    setMonitoring: (on, volumeDb) => void (state.monitoring = { on, volumeDb }),
    setNoiseGate: (p) => void (state.noiseGate = { ...state.noiseGate, ...p }),
    setDetectionConfig: (c) => void (state.detection = { ...state.detection, ...c }),
    getSettings: () => structuredClone(state),
  };

  // Alle 1.5 s ein Anschlag (Leersaiten der Gitarre, leicht verstimmt), der abklingt
  const strings = [40, 45, 50, 55, 59, 64];
  let t = 0;
  let hit = -1;
  let gateOpen = false;
  let detune = 0;
  setInterval(() => {
    t += 1 / 30;
    const sinceHit = t % 1.5;
    const index = Math.floor(t / 1.5);
    if (index !== hit) {
      hit = index;
      detune = Math.random() * 40 - 20;
      emit("note", { midi: strings[index % 6], cents: detune, timeMs: t * 1000, onsetType: index % 4 === 3 ? "legato" : "pick" });
    }

    const noise = -62 + Math.random() * 4;
    const note = -8 - sinceHit * 30;
    const rms = Math.max(noise, note) + state.inputGainDb;
    const peak = rms + 4 + Math.random() * 2;
    const g = state.noiseGate;
    gateOpen = gateOpen ? peak >= g.thresholdDb - g.hysteresisDb : peak >= g.thresholdDb;
    emit("level", { rmsDb: rms, peakDb: peak, gateOpen });

    const midi = strings[index % 6];
    const cents = detune * Math.exp(-sinceHit * 1.5) + (Math.random() - 0.5) * 2;
    emit("pitch", gateOpen
      ? { hz: 440 * 2 ** ((midi + cents / 100 - 69) / 12), midi, cents, confidence: 0.95 }
      : { hz: 0, midi: -1, cents: 0, confidence: 0 });
  }, 1000 / 30);

  return {
    addEventListener(eventId, fn) {
      const id = nextId++;
      if (!listeners.has(eventId)) listeners.set(eventId, new Map());
      listeners.get(eventId)!.set(id, fn);
      return [eventId, id];
    },
    removeEventListener([eventId, id]) {
      listeners.get(eventId)?.delete(id);
    },
    emitEvent(eventId, payload: any) {
      if (eventId !== "__juce__invoke") return;
      const result = functions[payload.name]?.(...payload.params);
      setTimeout(() => emit("__juce__complete", { promiseId: payload.resultId, result }), 5);
    },
  };
}
