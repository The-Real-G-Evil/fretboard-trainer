// Guitar-Pro-Import über alphaTab (SPEC Abschnitt 6, Phase 5: ohne Notenlängen).
// Aus einer Spur wird die reine Tonfolge: Pausen, Bindebogen-Fortsetzungen und Dead Notes
// entfallen, Akkorde werden (bis Phase 6) übersprungen. Saiten zählen wie im Rest der App von
// der tiefsten (0) aus; alphaTab zählt ab 1, ebenfalls von der tiefsten Saite.

import { importer, model, Settings } from "@coderline/alphatab";

export type Score = model.Score;

// Fehler in alphaTab 1.8.4: Hat der nächste Takt weniger Stimmen als der aktuelle (in Guitar Pro
// häufig, z. B. wenn Stimme 2 nur in einzelnen Takten benutzt wird), greift Voice._chain auf eine
// fehlende Stimme zu und das Einlesen bricht ab. Dann bleibt die Stimme hier am Taktende
// unverkettet (für die Tonfolge ohne Bedeutung). Entfernen, sobald alphaTab das selbst abfängt.
type ChainFn = (this: model.Voice, beat: model.Beat, bag?: unknown) => void;
const voiceProto = model.Voice.prototype as unknown as { _chain: ChainFn; __ftPatched?: boolean };
if (!voiceProto.__ftPatched) {
  const original = voiceProto._chain;
  voiceProto._chain = function (beat, bag) {
    const bar = this.bar;
    const next = bar?.nextBar?.voices[this.index];
    if (bar?.nextBar && beat.index >= this.beats.length - 1 && beat.isLastOfVoice && !(next && next.beats.length > 0)) {
      beat.chain(bag as never);
      return;
    }
    original.call(this, beat, bag);
  };
  voiceProto.__ftPatched = true;
}

export interface SongTrack {
  index: number;
  name: string;
  tuning: number[]; // MIDI je Saite, tiefste zuerst (leer: keine Saiten, z. B. Klavier)
  percussion: boolean;
}

export interface SongInfo {
  title: string;
  artist: string;
  bars: number;
  tracks: SongTrack[];
}

export interface SongNote {
  midi: number; // klingende Tonhöhe
  flat: boolean; // mit ♭ notiert (sonst ♯; bei Stammtönen ohne Bedeutung)
  string: number; // 0 = tiefste Saite
  fret: number;
  bar: number; // 0-basiert
  legato: boolean; // Ziel eines Hammer-ons/Pull-offs (ohne neuen Anschlag)
}

export interface Extraction {
  notes: SongNote[];
  skippedChords: number; // Akkorde kommen erst mit Phase 6
}

/** Liest .gp3/.gp4/.gp5/.gpx/.gp. Wirft bei unbekanntem Format. */
export function parseSong(bytes: Uint8Array): Score {
  return importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
}

/** Für Tests und Beispiele: Lied aus alphaTex. */
export function parseAlphaTex(tex: string): Score {
  return importer.ScoreLoader.loadAlphaTex(tex, new Settings());
}

export function songInfo(score: Score): SongInfo {
  return {
    title: score.title,
    artist: score.artist,
    bars: score.masterBars.length,
    tracks: score.tracks.map((t) => {
      const staff = t.staves[0];
      return {
        index: t.index,
        name: t.name,
        tuning: staff.isStringed ? [...staff.stringTuning.tunings].reverse() : [],
        percussion: staff.isPercussion,
      };
    }),
  };
}

const { NoteAccidentalMode } = model;

/** Schreibweise wie im Lied: ausdrückliches Vorzeichen, sonst nach der Tonart des Takts. */
function isFlat(note: model.Note, keySignature: number) {
  switch (note.accidentalMode) {
    case NoteAccidentalMode.ForceFlat:
    case NoteAccidentalMode.ForceDoubleFlat:
      return true;
    case NoteAccidentalMode.ForceSharp:
    case NoteAccidentalMode.ForceDoubleSharp:
      return false;
    default:
      return keySignature < 0;
  }
}

/** Tonfolge einer Spur (erste Stimme des ersten Systems). */
export function extractNotes(score: Score, trackIndex: number): Extraction {
  const staff = score.tracks[trackIndex]?.staves[0];
  const out: Extraction = { notes: [], skippedChords: 0 };
  if (!staff || staff.isPercussion) return out;

  for (const bar of staff.bars) {
    const keySignature = bar.masterBar.keySignature as number;
    for (const beat of bar.voices[0]?.beats ?? []) {
      if (beat.isRest) continue;
      const played = beat.notes.filter((n) => !n.isTieDestination && !n.isDead);
      if (played.length === 0) continue;
      if (played.length > 1) {
        out.skippedChords++;
        continue;
      }
      const n = played[0];
      out.notes.push({
        midi: n.realValue,
        flat: isFlat(n, keySignature),
        string: n.string - 1,
        fret: n.fret,
        bar: bar.index,
        legato: n.isHammerPullDestination,
      });
    }
  }
  return out;
}
