import { useEffect, useState } from "react";
import { api, noteName, type SongFile } from "../api";
import type { Instrument } from "../instruments";
import type { Score, SongInfo } from "../song/gpImport";
import { base64ToBytes, suggestTrack, tuningFromSong, withRecent, type SongSettings, type SongTargets } from "../song/songPractice";
import type { InstrumentPractice } from "./settings";

export interface LoadedSong {
  path: string;
  name: string;
  score: Score;
  info: SongInfo;
}

interface SongState {
  loading?: boolean;
  song?: LoadedSong;
  error?: string;
}

/** Liest und zerlegt eine Liedatei (alphaTab wird erst hier geladen). */
async function loadSong(file: SongFile | null): Promise<SongState> {
  if (!file) return {};
  if (file.error || !file.data) return { error: `${file.name}: ${file.error ?? "keine Daten"}` };
  try {
    const gp = await import("../song/gpImport");
    const score = gp.parseSong(base64ToBytes(file.data));
    return { song: { path: file.path, name: file.name, score, info: gp.songInfo(score) } };
  } catch (e) {
    return { error: `${file.name}: nicht lesbar (${e instanceof Error ? e.message : String(e)})` };
  }
}

/** Das in den Einstellungen gewählte Lied; `adopt` übernimmt ein gerade geöffnetes ohne erneutes Lesen. */
export function useSong(path: string) {
  const [state, setState] = useState<SongState>({});
  useEffect(() => {
    if (!path) return void setState({});
    if (state.song?.path === path) return;
    let alive = true;
    setState({ loading: true });
    api.readSongFile(path).then(loadSong).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [path]);
  return { ...state, adopt: setState };
}

interface SongPanelProps {
  instrument: Instrument; // Vorlage (Standardstimmung)
  tuned: Instrument;
  practice: InstrumentPractice;
  song: SongSettings;
  loaded: ReturnType<typeof useSong>;
  targets: SongTargets | null;
  skippedChords: number;
  onSongChange: (s: SongSettings) => void;
  onPracticeChange: (p: InstrumentPractice) => void;
}

const tuningText = (tuning: number[]) => tuning.map((m) => noteName(m).name).join("");

export function SongPanel({ instrument, tuned, practice, song, loaded, targets, skippedChords, onSongChange, onPracticeChange }: SongPanelProps) {
  const set = (patch: Partial<SongSettings>) => onSongChange({ ...song, ...patch });
  const info = loaded.song?.info;
  const track = info?.tracks[song.track];

  const choose = async (file: SongFile | null) => {
    if (!file) return;
    loaded.adopt({ loading: true });
    const s = await loadSong(file);
    loaded.adopt(s);
    if (!s.song) return;
    set({
      path: file.path, name: file.name, track: Math.max(0, suggestTrack(s.song.info.tracks, tuned)), barFrom: 0, barTo: -1,
      recent: withRecent(song.recent, { path: file.path, name: file.name }),
    });
  };

  const songTuning = track?.tuning ?? [];
  const proposed = songTuning.length ? tuningFromSong(instrument, songTuning) : null;
  const tunedMatches = proposed !== null && proposed.offsets.every((o, i) => o === practice.tuning.offsets[i]);
  const bars = info?.bars ?? 0;
  const barTo = song.barTo < 0 ? bars - 1 : Math.min(song.barTo, bars - 1);

  return (
    <div className="song-panel">
      <div className="song-row">
        <button onClick={() => api.openSongFile().then(choose)}>Lied öffnen …</button>
        {song.recent.length > 0 && (
          <select aria-label="Zuletzt geöffnet" value={song.path}
                  onChange={(e) => {
                    const r = song.recent.find((x) => x.path === e.target.value);
                    if (r) set({ path: r.path, name: r.name, track: -1, barFrom: 0, barTo: -1, recent: withRecent(song.recent, r) });
                  }}>
            {!song.path && <option value="">Zuletzt geöffnet …</option>}
            {song.recent.map((r) => <option key={r.path} value={r.path}>{r.name}</option>)}
          </select>
        )}
        {loaded.loading && <span className="hint">Lied wird gelesen …</span>}
        {loaded.error && <span className="bad">{loaded.error}</span>}
      </div>

      {info && (
        <>
          <p className="song-title">
            <strong>{info.title || loaded.song!.name}</strong>
            {info.artist && <span className="hint"> · {info.artist}</span>}
            <span className="hint"> · {bars} Takte</span>
          </p>
          <div className="song-row">
            <label>
              <span>Spur</span>
              <select value={song.track} onChange={(e) => set({ track: Number(e.target.value) })}>
                {info.tracks.map((t) => (
                  <option key={t.index} value={t.index} disabled={t.percussion || t.tuning.length === 0}>
                    {t.name || `Spur ${t.index + 1}`}
                    {t.tuning.length > 0 ? ` (${t.tuning.length} Saiten, ${tuningText(t.tuning)})` : t.percussion ? " (Schlagzeug)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Takte</span>
              <select aria-label="von Takt" value={song.barFrom}
                      onChange={(e) => set({ barFrom: Number(e.target.value), barTo: Math.max(Number(e.target.value), barTo) })}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
              </select>
              <span className="hint">bis</span>
              <select aria-label="bis Takt" value={barTo}
                      onChange={(e) => set({ barTo: Number(e.target.value) === bars - 1 ? -1 : Number(e.target.value),
                                             barFrom: Math.min(song.barFrom, Number(e.target.value)) })}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
              </select>
            </label>
            <label title="Am Ende des Bereichs von vorn beginnen – zum Üben schwieriger Stellen.">
              <input type="checkbox" checked={song.loop} onChange={(e) => set({ loop: e.target.checked })} />
              <span>Wiederholen</span>
            </label>
          </div>

          {track && songTuning.length > 0 && !tunedMatches && (
            <p className="hint song-warning">
              Die Spur ist für {songTuning.length} Saiten in {tuningText(songTuning)} geschrieben, eingestellt ist{" "}
              {tuned.name} in {tuningText(tuned.strings.map((s) => s.midi))}.
              {proposed
                ? <> <button onClick={() => onPracticeChange({ ...practice, tuning: proposed })}>Stimmung übernehmen</button></>
                : " Die Griffstellen werden für dein Instrument neu bestimmt."}
            </p>
          )}
          {targets && (
            <p className="hint">
              {targets.targets.length} {targets.targets.length === 1 ? "Ton" : "Töne"} im Bereich
              {skippedChords > 0 && ` · ${skippedChords} ${skippedChords === 1 ? "Akkord" : "Akkorde"} übersprungen (kommen mit Phase 6)`}
              {targets.unplayable > 0 && ` · ${targets.unplayable} ${targets.unplayable === 1 ? "Ton liegt" : "Töne liegen"} außerhalb deines Instruments und ${targets.unplayable === 1 ? "entfällt" : "entfallen"}`}
              {!targets.ownPositions && targets.targets.length > 0 && " · Griffstellen selbst bestimmt (tiefster Bund)"}
              . Pausen und Notenlängen entfallen, gespielt wird die reine Tonfolge.
            </p>
          )}
        </>
      )}
      {!info && !loaded.loading && !loaded.error && (
        <p className="hint">Öffne eine Guitar-Pro-Datei (.gp, .gpx, .gp5, .gp4, .gp3) und wähle die Spur, die du spielen willst.</p>
      )}
    </div>
  );
}
