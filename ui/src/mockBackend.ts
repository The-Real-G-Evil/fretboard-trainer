// Ersatz-Backend fuer die UI-Entwicklung im normalen Browser (ohne JUCE).
// Simuliert Geraeteliste, Einstellungen, Pegel, Tonhoehe und Noten.

import type { JuceBackend } from "./juce";
import { DEFAULT_EFFECTS } from "./effects/effects";

export function createMockBackend(): JuceBackend {
  const listeners = new Map<string, Map<number, (p: any) => void>>();
  let nextId = 0;
  let mockExpected: number[] = [];
  const mockEffects: Record<string, unknown> = { ...DEFAULT_EFFECTS };
  const mockAvailable = [
    { id: "vst3-amp", name: "Beispiel Amp", vendor: "Vorschau", category: "Fx|Distortion" },
    { id: "vst3-delay", name: "Beispiel Delay", vendor: "Vorschau", category: "Fx|Delay" },
  ];
  const mockRack: { name: string; vendor: string; enabled: boolean; latencyMs: number; hasEditor: boolean }[] = [];
  let pluginsScanned = false, pluginsScanning = false;
  const mockPlugins = () => ({
    scanned: pluginsScanned, scanning: pluginsScanning, available: pluginsScanned ? mockAvailable : [], rack: [...mockRack],
    latencyMs: mockRack.filter((r) => r.enabled).reduce((a, r) => a + r.latencyMs, 0),
  });
  const mockReviews = new Map<number, unknown>();

  const state = {
    version: "00.00.02",
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
  const song = {
    data: null as null | { ppq: number; tempo: [number, number][]; events: [number, number, number, number][]; halts: number[] },
    tick: 0, speed: 1, start: 0, end: 0, loop: false, passes: 0, wait: false, playing: false, finished: false,
    pass: 0, released: 0, countInMs: 0,
    bpm(): number {
      let b = 120;
      for (const [t, v] of this.data?.tempo ?? []) if (t <= this.tick) b = v;
      return b;
    },
  };
  let songLast = performance.now();
  globalThis.setInterval(() => {
    const now = performance.now();
    const dt = now - songLast;
    songLast = now;
    if (!song.data || !song.playing) return;
    const halts = song.data.halts;
    const next = halts.findIndex((h) => h >= song.tick);
    const halted = song.wait && next >= 0 && next >= song.released && song.tick >= halts[next];
    if (song.countInMs > 0) song.countInMs = Math.max(0, song.countInMs - dt);
    else if (!halted) {
      let t = song.tick + (dt / 60000) * song.bpm() * song.data.ppq * song.speed;
      if (song.wait && next >= 0 && next >= song.released) t = Math.min(t, halts[next]);
      song.tick = t;
      if (song.tick >= song.end) {
        if (song.loop && (song.passes <= 0 || song.pass + 1 < song.passes)) Object.assign(song, { tick: song.start, pass: song.pass + 1, released: 0 });
        else Object.assign(song, { playing: false, finished: true });
      }
    }
    emit("songPosition", { tick: song.tick, streamMs: now, playing: song.playing, halted, countIn: song.countInMs > 0,
                           finished: song.finished, pass: song.pass, released: song.released, latencyMs: 0 });
  }, 16);
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
    getEffects: () => ({ ...mockEffects }),
    // Vorschau: zwei erfundene Plugins, Suche dauert eine Sekunde
    getPlugins: () => mockPlugins(),
    scanPlugins: () => {
      pluginsScanning = true;
      setTimeout(() => emit("pluginScan", { progress: 0.5, current: "Beispiel Amp" }), 300);
      setTimeout(() => {
        pluginsScanning = false;
        pluginsScanned = true;
        emit("pluginScan", { ...mockPlugins(), done: true });
      }, 1000);
      return mockPlugins();
    },
    addPlugin: (id) => {
      const p = mockAvailable.find((x) => x.id === id);
      if (p) mockRack.push({ name: p.name, vendor: p.vendor, enabled: true, latencyMs: 2.7, hasEditor: true });
      return mockPlugins();
    },
    removePlugin: (slot) => (mockRack.splice(slot, 1), mockPlugins()),
    movePlugin: (slot, delta) => {
      const to = slot + delta;
      if (to >= 0 && to < mockRack.length) [mockRack[slot], mockRack[to]] = [mockRack[to], mockRack[slot]];
      return mockPlugins();
    },
    setPluginEnabled: (slot, on) => ((mockRack[slot].enabled = on), mockPlugins()),
    openPluginEditor: () => mockPlugins(),
    setEffects: (p) => Object.assign(mockEffects, p),
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
    setExpectedNotes: (midis) => void (mockExpected = midis),
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
    getSongStats: (instrument, gpFile, gpTrack) => {
      const bars = new Map<number, { bar: number; attempts: number; hits: number }>();
      for (const s of mockSessions as any[])
        if (s.instrument === instrument && s.source === "gp" && s.gpFile === gpFile && s.gpTrack === gpTrack)
          for (const a of s.attempts)
            if (a.bar !== undefined) {
              const b = bars.get(a.bar) ?? { bar: a.bar, attempts: 0, hits: 0 };
              b.attempts++;
              if (a.correct) b.hits++;
              bars.set(a.bar, b);
            }
      return { bars: [...bars.values()].sort((a, b) => a.bar - b.bar) };
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
    runRecordingStart: () => void (recordingSince = Date.now()),
    // Vorschau: „Nachanalyse“ übernimmt die Live-Wertung und legt erkannte Noten an die erwarteten Stellen
    reviewFinish: (id, p) => {
      const s = mockSessions.find((x) => x.id === id);
      if (id === null || !s || s.attempts.length === 0 || p.items.length === 0) return { skipped: true };
      const durationSec = Math.max(2, (Date.now() - recordingSince) / 1000);
      const items = p.items.map((it: any, i: number) => ({
        midis: it.midis, live: it.live, timeSec: (i + 0.5) * (durationSec / p.items.length),
        verdict: it.live === "hit" ? "hit" : i % 2 ? "wrong" : "missed", segment: it.live === "hit" || i % 2 ? i : -1,
      }));
      const segments = items.map((it: any, i: number) => ({ start: it.timeSec - 0.02, end: it.timeSec + 0.3,
        midi: it.verdict === "wrong" ? it.midis[0] + 1 : it.midis[0], cents: 0, pick: true, i }));
      const finalHits = items.filter((it: any) => it.verdict === "hit").length;
      const review = { sessionId: id, mode: p.mode, toleranceMs: p.toleranceMs, durationSec, truncated: false, items, segments,
        extra: [], peaks: Array.from({ length: 600 }, (_, k) => Math.abs(Math.sin(k / 7)) * (0.3 + 0.7 * ((k * 37) % 11) / 11)),
        liveHits: p.liveHits, liveTotal: p.liveHits + p.liveMisses, finalHits, finalTotal: items.length };
      mockReviews.set(id, review);
      Object.assign(s, { finalHits, finalTotal: items.length });
      return { sessionId: id, finalHits, finalTotal: items.length, liveHits: p.liveHits, liveTotal: p.liveHits + p.liveMisses };
    },
    getReview: (id) => mockReviews.get(id) ?? null,
    playReview: () => true,
    stopReview: () => true,
    getStreamTime: () => ({ streamMs: performance.now(), inputLatencyMs: 0 }), // Mock-Töne nutzen performance.now()
    // Liedwiedergabe: ohne Ton simuliert (Position, Vorzähler, Halt im Warte-Modus, Wiederholen)
    songLoad: (s) => {
      song.data = s;
      Object.assign(song, { tick: 0, playing: false, finished: false, pass: 0, released: 0, countInMs: 0, start: 0,
                            end: s.events.length ? s.events[s.events.length - 1][0] : 0 });
      return { soundFont: true };
    },
    songPlay: (countIn) => {
      if (song.finished || song.tick >= song.end) Object.assign(song, { tick: song.start, pass: 0, released: 0 });
      song.finished = false;
      song.playing = true;
      song.countInMs = countIn ? (4 * 60000) / (song.bpm() * song.speed) : 0;
    },
    songPause: () => void (song.playing = false),
    songSeek: (t) => void (song.tick = t),
    songSetSpeed: (f) => void (song.speed = f),
    songSetRange: (s, e, l, p) => void Object.assign(song, {
      start: s, end: e, loop: l, passes: p ?? 0,
      tick: song.playing && song.tick >= s && song.tick < e ? song.tick : s,
    }),
    songSetChannelGains: () => undefined,
    getSoundFont: () => ({ name: "Sonivox (eingebaut)", path: "", builtin: true }),
    chooseSoundFont: () => ({ error: "In der Vorschau gibt es keinen Dateidialog" }),
    resetSoundFont: () => ({ name: "Sonivox (eingebaut)", path: "", builtin: true }),
    songSetMetronome: () => undefined,
    songSetWaitMode: (on) => void (song.wait = on),
    songSetHalts: (ticks) => void (song.data && (song.data.halts = [...ticks].sort((a, b) => a - b))),
    songSetReleased: (p, n) => void (p === song.pass && (song.released = n)),
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

  // Nur in der Vorschau: erwarteten Akkord „anschlagen“, ohne die Töne in `missing`,
  // z. B. window.__mockChord() oder window.__mockChord([52])
  (globalThis as any).__mockChord = (missing: number[] = [], levelDb = -20) => {
    const timeMs = performance.now();
    const played = mockExpected.filter((m) => !missing.includes(m));
    if (played.length) emit("note", { midi: Math.min(...played), cents: 0, timeMs, onsetType: "pick", levelDb, riseDb: 25 });
    if (mockExpected.length >= 2)
      setTimeout(() => emit("chord", {
        timeMs, tones: mockExpected.map((midi) => ({ midi, present: !missing.includes(midi), strength: missing.includes(midi) ? 0 : 1, shared: false })),
      }), 150);
  };

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
