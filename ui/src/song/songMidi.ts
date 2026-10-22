// Liedwiedergabe im Kern: alphaTab erzeugt die MIDI-Daten des Lieds (Wiederholungen aufgelöst, Tempo,
// Programme, Lautstärken), der Kern spielt sie über den Soundfont auf dem Audio-Gerät der App.
// Hier werden sie in das kompakte Format für songLoad übersetzt und das Mischpult auf MIDI-Kanäle
// abgebildet.

import { midi, Settings } from "@coderline/alphatab";
import type { Score } from "./gpImport";
import type { TrackMix } from "./songPractice";

export interface CoreSong {
  ppq: number;
  tempo: [number, number][]; // [Tick, BPM]
  events: [number, number, number, number][]; // [Tick, Status inkl. Kanal, Daten 1, Daten 2]
  halts: number[]; // Warte-Modus: Ticks der Noten der eigenen Spur
}

// alphaTab-Ereignistypen (Achtung: NoteOn/NoteOff sind dort gegenüber MIDI vertauscht nummeriert)
const AT_NOTE_ON = midi.MidiEventType.NoteOn as number;
const AT_NOTE_OFF = midi.MidiEventType.NoteOff as number;
const AT_CONTROL = midi.MidiEventType.ControlChange as number;
const AT_PROGRAM = midi.MidiEventType.ProgramChange as number;
const AT_PITCH_BEND = midi.MidiEventType.PitchBend as number;
const AT_TEMPO = midi.MidiEventType.TempoChange as number;

/** MIDI-Daten des ganzen Lieds für den Kern. */
export function coreSong(score: Score, halts: number[] = []): CoreSong {
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, new Settings(), new midi.AlphaSynthMidiFileHandler(file)).generate();
  const events: CoreSong["events"] = [];
  const tempo: CoreSong["tempo"] = [];
  for (const e of file.events as unknown as Record<string, number>[]) {
    const ch = e.channel ?? 0;
    switch (e.type) {
      case AT_NOTE_ON:
        events.push([e.tick, 0x90 | ch, e.noteKey, e.noteVelocity]);
        break;
      case AT_NOTE_OFF:
        events.push([e.tick, 0x80 | ch, e.noteKey, 0]);
        break;
      case AT_CONTROL:
        events.push([e.tick, 0xb0 | ch, e.controller, e.value]);
        break;
      case AT_PROGRAM:
        events.push([e.tick, 0xc0 | ch, e.program, 0]);
        break;
      case AT_PITCH_BEND:
        events.push([e.tick, 0xe0 | ch, e.value & 0x7f, (e.value >> 7) & 0x7f]);
        break;
      case AT_TEMPO:
        tempo.push([e.tick, e.beatsPerMinute]);
        break;
    }
  }
  return { ppq: 960, tempo, events, halts };
}

/** Lautstärke je MIDI-Kanal aus dem Mischpult (Stumm und Solo aufgelöst). */
export function channelGains(score: Score, mix: TrackMix[]): number[] {
  const gains = new Array(16).fill(1);
  const anySolo = mix.some((m) => m.solo);
  score.tracks.forEach((t, i) => {
    const m = mix[i] ?? { volume: 1, mute: false, solo: false };
    const g = m.mute || (anySolo && !m.solo) ? 0 : m.volume;
    for (const ch of [t.playbackInfo.primaryChannel, t.playbackInfo.secondaryChannel])
      if (ch >= 0 && ch < 16) gains[ch] = g;
  });
  return gains;
}
