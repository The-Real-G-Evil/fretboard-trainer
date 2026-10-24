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
  tempos: number[]; // Tempo (Viertel je Minute) am Anfang jedes Takts
}

export interface SongNote {
  midi: number; // klingende Tonhöhe
  flat: boolean; // mit ♭ notiert (sonst ♯; bei Stammtönen ohne Bedeutung)
  string: number; // 0 = tiefste Saite
  fret: number;
  bar: number; // 0-basiert
  legato: boolean; // Ziel eines Hammer-ons/Pull-offs (ohne neuen Anschlag)
  chord?: { midi: number; string: number; fret: number }[]; // Akkord: alle Töne aufsteigend (oben: tiefster)
}

export interface Extraction {
  notes: SongNote[];
  chords: number; // davon Akkorde
}

/** Liest .gp3/.gp4/.gp5/.gpx/.gp. Wirft bei unbekanntem Format. */
export function parseSong(bytes: Uint8Array): Score {
  const settings = new Settings();
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  if (repairSharedBars(score)) score.finish(settings);
  dropOrphanChords(score);
  return score;
}

/** Manche GPX-Dateien verweisen auf Akkord-Diagramme, die es in der Spur nicht gibt; alphaTab bricht
    dann beim Zeichnen ab (Notenbild leer). Solche Verweise entfernen – die Noten bleiben.
    Rückgabe: Anzahl entfernter Verweise. */
export function dropOrphanChords(score: Score): number {
  let dropped = 0;
  for (const t of score.tracks)
    for (const staff of t.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            if (beat.chordId !== null && !staff.hasChord(beat.chordId)) {
              beat.chordId = null;
              dropped++;
            }
  return dropped;
}

const ownFields = <T extends object>(target: T, source: T, skip: string[]) => {
  for (const [k, v] of Object.entries(source)) if (!skip.includes(k)) (target as Record<string, unknown>)[k] = v;
  return target;
};

/** Fehler in alphaTab 1.8.4 (GPX/GP): Guitar Pro speichert gleiche Takte und Stimmen nur einmal und
    verweist mehrfach darauf. alphaTab hängt dann dasselbe Takt-Objekt an mehreren Stellen ein und fügt
    ihm bei jedem Verweis die Stimmen erneut hinzu; die Schläge jedes Verweises landen nacheinander in
    derselben Stimme. Folge: Takte mit Dutzenden Stimmen, falsche Tonfolgen in der Wiedergabe und
    sekundenlange Berechnungen. Hier bekommt jede Stelle ihren eigenen Takt mit eigenen Stimmen, und
    jede Stimme die Schläge ihres Verweises (in Einleserichtung: Takt für Takt, Spur für Spur).
    Rückgabe: ob etwas repariert wurde (dann muss score.finish() erneut laufen). */
export function repairSharedBars(score: Score): boolean {
  const staves = score.tracks.flatMap((t) => t.staves);
  // Verweise je Takt-Objekt und Verwendungen je Stimme (in den Stimmenlisten der verschiedenen Takt-Objekte
  // steht jede geteilte Stimme einmal je Verweis; unbenutzte Stimmplätze legt alphaTab je Verweis neu an)
  const barUses = new Map<model.Bar, number>();
  for (const staff of staves) for (const bar of staff.bars) barUses.set(bar, (barUses.get(bar) ?? 0) + 1);
  const voiceUses = new Map<model.Voice, number>();
  for (const bar of barUses.keys()) for (const v of bar.voices) voiceUses.set(v, (voiceUses.get(v) ?? 0) + 1);
  if ([...barUses.values(), ...voiceUses.values()].every((n) => n === 1)) return false;

  // Einleserichtung des Parsers: Takt für Takt, darin Spur für Spur
  const barOccurrence = new Map<model.Bar, number>();
  const voiceOccurrence = new Map<model.Voice, number>();
  const bars = staves.map((st) => [...st.bars]);
  for (const st of staves) st.bars.length = 0;
  for (let pos = 0; pos < score.masterBars.length; pos++) {
    staves.forEach((staff, si) => {
      const original = bars[si][pos];
      if (!original) return;
      const uses = barUses.get(original) ?? 1;
      const occ = barOccurrence.get(original) ?? 0;
      barOccurrence.set(original, occ + 1);
      const perOcc = Math.min(4, Math.floor(original.voices.length / uses)); // Guitar Pro: höchstens 4 Stimmen
      const bar = ownFields(new model.Bar(), original, ["id", "index", "staff", "voices", "nextBar", "previousBar"]);
      for (const v of original.voices.slice(occ * perOcc, (occ + 1) * perOcc)) {
        const vUses = voiceUses.get(v) ?? 1;
        const vOcc = voiceOccurrence.get(v) ?? 0;
        voiceOccurrence.set(v, vOcc + 1);
        const perUse = Math.floor(v.beats.length / vUses);
        const voice = ownFields(new model.Voice(), v, ["id", "index", "bar", "beats"]);
        for (const beat of v.beats.slice(vOcc * perUse, (vOcc + 1) * perUse)) {
          // Verkettung aus dem ersten, fehlerhaften Durchlauf verwerfen (sonst Ringe und Bindebögen,
          // Hammer-ons, Bögen und Slides zu Noten anderer Verweise); score.finish() bestimmt sie neu
          beat.nextBeat = null;
          beat.previousBeat = null;
          for (const n of beat.notes) {
            n.tieOrigin = n.tieDestination = null;
            n.hammerPullOrigin = n.hammerPullDestination = null;
            n.slurOrigin = n.slurDestination = null;
            n.slideOrigin = n.slideTarget = null;
          }
          voice.addBeat(beat);
        }
        bar.addVoice(voice);
      }
      staff.addBar(bar);
    });
  }
  return true;
}

/** Für Tests und Beispiele: Lied aus alphaTex. */
export function parseAlphaTex(tex: string): Score {
  return importer.ScoreLoader.loadAlphaTex(tex, new Settings());
}

/** Liest eine Lieddatei nach ihrer Endung: .tex/.alphatex als alphaTex (Kurse), sonst Guitar Pro. */
export function parseSongFile(path: string, bytes: Uint8Array): Score {
  return /\.(tex|alphatex)$/i.test(path) ? parseAlphaTex(new TextDecoder().decode(bytes)) : parseSong(bytes);
}

export function songInfo(score: Score): SongInfo {
  return {
    title: score.title,
    artist: score.artist,
    bars: score.masterBars.length,
    tempos: tempoByBar(score),
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

/** Tempo je Takt: die letzte Tempoangabe bis zu diesem Takt (sonst das Grundtempo des Lieds). */
function tempoByBar(score: Score): number[] {
  let tempo = score.tempo;
  return score.masterBars.map((mb) => {
    if (mb.tempoAutomations.length > 0) tempo = mb.tempoAutomations[0].value;
    return Math.round(tempo);
  });
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
  const out: Extraction = { notes: [], chords: 0 };
  if (!staff || staff.isPercussion) return out;

  for (const bar of staff.bars) {
    const keySignature = bar.masterBar.keySignature as number;
    for (const beat of bar.voices[0]?.beats ?? []) {
      if (beat.isRest) continue;
      const played = beat.notes.filter((n) => !n.isTieDestination && !n.isDead);
      if (played.length === 0) continue;
      const sorted = [...played].sort((a, b) => a.realValue - b.realValue);
      const n = sorted[0];
      const chord = sorted.length > 1 ? sorted.map((c) => ({ midi: c.realValue, string: c.string - 1, fret: c.fret })) : undefined;
      if (chord) out.chords++;
      out.notes.push({
        midi: n.realValue,
        flat: isFlat(n, keySignature),
        string: n.string - 1,
        fret: n.fret,
        bar: bar.index,
        legato: !chord && n.isHammerPullDestination,
        ...(chord ? { chord } : {}),
      });
    }
  }
  return out;
}
