// Ersatz-Backend fuer die UI-Entwicklung im normalen Browser (ohne JUCE).
// Simuliert Geraeteliste, Einstellungen, Pegel, Tonhoehe und Noten.

import type { JuceBackend } from "./juce";

export function createMockBackend(): JuceBackend {
  const listeners = new Map<string, Map<number, (p: any) => void>>();
  let nextId = 0;

  const state = {
    instrument: "guitar6",
    inputGainDb: 0,
    monitoring: { on: true, volumeDb: -6 },
    noiseGate: { thresholdDb: -50, attackMs: 1, holdMs: 50, releaseMs: 100, hysteresisDb: 6 },
    detection: { minHz: 65, maxHz: 1470, centsTolerance: 25 },
    device: {
      type: "Windows Audio",
      inputDevice: "Mock-Interface",
      outputDevice: "Mock-Interface",
      sampleRate: 48000,
      bufferSize: 128,
      inputChannel: 0,
    },
  };

  let recordingSince = 0;
  const mockSessions: any[] = [];
  let metroTimer: number | undefined;
  let metroGen = 0;
  const uiSettings: Record<string, unknown> = {};
  const profiles: Record<string, { minHz: number; maxHz: number }> = {};
  const defaultTuning = { minRiseDb: 3, strongFluxFactor: 10, fluxMultiplier: 1.5, stableFrames: 3, legatoFrames: 12 };
  const calibration: any = { takes: [], tuning: { ...defaultTuning }, defaultTuning, busy: false };

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
    setDetectionConfig: (c) => {
      state.detection = { ...state.detection, ...c };
      profiles[state.instrument] = { minHz: state.detection.minHz, maxHz: state.detection.maxHz };
    },
    setInstrument: ({ id, minHz, maxHz }) => {
      state.instrument = id;
      profiles[id] ??= { minHz, maxHz };
      state.detection = { ...state.detection, ...profiles[id] };
      return structuredClone(state);
    },
    getSettings: () => structuredClone(state),
    getUiSettings: () => structuredClone(uiSettings),
    setExpectedNotes: () => undefined,
    statsStartSession: (info) => {
      const id = mockSessions.length + 1;
      mockSessions.push({ id, ...info, startedAt: new Date().toISOString(), score: 0, durationSec: 0, attempts: [] as any[] });
      return { id };
    },
    statsAddAttempt: (id, a) => void mockSessions.find((s) => s.id === id)?.attempts.push(a),
    statsEndSession: (id, r) => {
      const s = mockSessions.find((x) => x.id === id);
      if (s) Object.assign(s, r);
    },
    getStats: (instrument) => {
      const sessions = mockSessions.filter((s) => s.instrument === instrument && s.attempts.length > 0);
      const byMidi = new Map<number, any>();
      const confusions = new Map<string, any>();
      for (const s of sessions)
        for (const a of s.attempts) {
          const n = byMidi.get(a.expectedMidi) ?? { midi: a.expectedMidi, string: -1, fret: -1, attempts: 0, hits: 0,
            avgReactionMs: 0, avgTimingAbsMs: 0, lastPracticed: s.startedAt };
          n.attempts++;
          if (a.correct) {
            n.avgReactionMs = (n.avgReactionMs * n.hits + (a.reactionMs ?? 0)) / (n.hits + 1);
            n.avgTimingAbsMs = (n.avgTimingAbsMs * n.hits + Math.abs(a.timingMs ?? 0)) / (n.hits + 1);
            n.hits++;
          } else if (a.playedMidi !== undefined) {
            const k = `${a.expectedMidi}-${a.playedMidi}`;
            const c = confusions.get(k) ?? { expectedMidi: a.expectedMidi, playedMidi: a.playedMidi, count: 0 };
            c.count++;
            confusions.set(k, c);
          }
          byMidi.set(a.expectedMidi, n);
        }
      return {
        notes: [...byMidi.values()],
        sessions: sessions.map((s) => {
          const hits = s.attempts.filter((a: any) => a.correct);
          const devs: number[] = hits.filter((a: any) => a.levelDevDb !== undefined).map((a: any) => a.levelDevDb);
          const w = (s as any).dynamicsWindowDb;
          const level = w === undefined ? {} : {
            levelRated: devs.length,
            levelInWindowRate: devs.filter((d) => Math.abs(d) <= w).length / Math.max(1, devs.length),
            levelSpreadDb: Math.sqrt(devs.reduce((x, d) => x + d * d, 0) / Math.max(1, devs.length)),
          };
          return { ...s, ...level, hits: hits.length, misses: s.attempts.length - hits.length,
            avgReactionMs: hits.reduce((x: number, a: any) => x + (a.reactionMs ?? 0), 0) / Math.max(1, hits.length),
            avgTimingAbsMs: hits.reduce((x: number, a: any) => x + Math.abs(a.timingMs ?? 0), 0) / Math.max(1, hits.length) };
        }).reverse(),
        confusions: [...confusions.values()].sort((a, b) => b.count - a.count),
        levels: (() => {
          const by = new Map<number, number[]>();
          for (const s of sessions)
            for (const a of s.attempts)
              if (a.correct && a.levelDevDb !== undefined) by.set(a.expectedMidi, [...(by.get(a.expectedMidi) ?? []), a.levelDevDb]);
          return [...by].map(([midi, d]) => ({ midi, count: d.length, avgDevDb: d.reduce((x, y) => x + y, 0) / d.length }));
        })(),
      };
    },
    clearStats: (instrument) => {
      for (let i = mockSessions.length - 1; i >= 0; i--) if (mockSessions[i].instrument === instrument) mockSessions[i].attempts = [];
    },
    setMetronome: (m) => {
      window.clearInterval(metroTimer);
      const gen = ++metroGen;
      if (!m.on) return;
      let index = 0;
      const tick = () => {
        const timeMs = performance.now();
        ((window as any).__mockBeats ??= []).push(timeMs); // nur für Tests in der Vorschau
        emit("beat", { index: index++, timeMs, accent: index % 4 === 1, latencyMs: 0 });
      };
      window.setTimeout(() => {
        if (gen !== metroGen) return;
        tick();
        metroTimer = window.setInterval(tick, 60000 / m.bpm);
      }, 150);
    },
    setUiSetting: (key, value) => {
      if (value === null || value === undefined) delete uiSettings[key];
      else uiSettings[key] = value;
    },

    // Kalibrierung: Aufnahmen werden nur simuliert (zufällige Bewertung)
    startRecording: () => void (recordingSince = Date.now()),
    stopRecording: () => ({ durationSec: (Date.now() - recordingSince) / 1000, truncated: false }),
    saveDiagnostic: () => ({ path: "(Vorschau: nicht gespeichert)" }),
    // Ohne Kern kein Dateidialog: ein eingebautes Beispiel-Lied
    openSongFile: async () => ({ path: "vorschau:demo", name: "Vorschau-Riff", data: (await import("./song/demo")).demoSongBase64() }),
    readSongFile: async (path) => path === "vorschau:demo"
      ? { path, name: "Vorschau-Riff", data: (await import("./song/demo")).demoSongBase64() }
      : { path, name: path, error: "Datei nicht gefunden" },
    getCalibration: () => structuredClone({ ...calibration, instrument: state.instrument }),
    saveCalibrationTake: (info) => {
      const take: any = {
        ...info,
        id: `mock-${Date.now()}`,
        createdAt: new Date().toISOString(),
        durationSec: (Date.now() - recordingSince) / 1000,
        expected: info.notes,
      };
      if (info.kind === "silence") {
        const peak = -74 + Math.random() * 6;
        take.noise = { peakDb: peak, rmsDb: peak - 11, suggestedGateDb: Math.round((peak + 6) * 2) / 2 };
      } else {
        const alignment = info.notes.map((_: unknown, i: number) => {
          const r = Math.random();
          return { kind: r < 0.8 ? "correct" : r < 0.88 ? "wrongType" : r < 0.94 ? "missing" : "wrongPitch", expected: i, detected: i };
        });
        const count = (k: string) => alignment.filter((a: any) => a.kind === k).length;
        const cost = count("missing") + count("wrongPitch") + 0.5 * count("wrongType");
        take.score = {
          accuracy: Math.max(0, 1 - cost / info.notes.length), expected: info.notes.length,
          correct: count("correct"), wrongType: count("wrongType"), wrongPitch: count("wrongPitch"),
          missing: count("missing"), extra: 0, alignment,
          detected: info.notes.map((n: any) => ({ midi: n.midi + (Math.random() < 0.5 ? 12 : 0), cents: 0, timeMs: 0, onsetType: n.type === "pick" ? "legato" : "pick" })),
        };
      }
      calibration.takes.push(take);
      return take;
    },
    deleteCalibrationTake: (id) => {
      calibration.takes = calibration.takes.filter((t: any) => t.id !== id);
      return true;
    },
    optimizeCalibration: async () => {
      for (let p = 0; p <= 1; p += 0.1) {
        emit("calibrationProgress", { progress: p });
        await new Promise((r) => setTimeout(r, 80));
      }
      const takes = calibration.takes.filter((t: any) => t.kind === "notes").map((t: any) => ({ id: t.id, accuracy: t.score.accuracy }));
      return {
        combinations: 360,
        current: { tuning: calibration.tuning, totalCost: 4, takes },
        best: { tuning: { ...calibration.tuning, strongFluxFactor: 14 }, totalCost: 1.5, takes },
      };
    },
    setDetectionTuning: (t) => {
      calibration.tuning = t ?? { ...calibration.defaultTuning };
      return structuredClone(calibration);
    },
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

  // Nur in der Vorschau: Ton „spielen“, z. B. window.__mockPlay(40) oder mit Pegel window.__mockPlay(40, 0, -24)
  (globalThis as any).__mockPlay = (midi: number, cents = 0, levelDb = -20) =>
    emit("note", { midi, cents, timeMs: performance.now(), onsetType: "pick", levelDb, riseDb: 25 });

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
      Promise.resolve(result).then((r) =>
        setTimeout(() => emit("__juce__complete", { promiseId: payload.resultId, result: r }), 5));
    },
  };
}
