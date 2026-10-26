import { useEffect, useState } from "react";
import { api, noteName, type BarStat, type SongFile } from "../api";
import { rateColor } from "../stats/StatsPage";
import type { Instrument } from "../instruments";
import type { Score, SongInfo } from "../song/gpImport";
import { base64ToBytes, problemBars, suggestTrack, tuningFromSong, withRecent, type SongSettings, type SongTargets } from "../song/songPractice";
import type { InstrumentPractice } from "./settings";
import { t, tCore } from "../i18n";

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
  if (file.error || !file.data) return { error: `${file.name}: ${file.error ? tCore(file.error) : t("keine Daten")}` };
  try {
    const gp = await import("../song/gpImport");
    const score = gp.parseSongFile(file.path, base64ToBytes(file.data));
    return { song: { path: file.path, name: file.name, score, info: gp.songInfo(score) } };
  } catch (e) {
    return { error: `${file.name}: ${t("nicht lesbar ({reason})", { reason: e instanceof Error ? e.message : String(e) })}` };
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
  chords: number; // davon Akkorde (Lied-Tonfolge im Bereich)
  onSongChange: (s: SongSettings) => void;
  onPracticeChange: (p: InstrumentPractice) => void;
}

/** Ordner einer Datei (Windows- oder Unix-Pfad). */
export const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

const tuningText = (tuning: number[]) => tuning.map((m) => noteName(m).name).join("");

export function SongPanel({ instrument, tuned, practice, song, loaded, targets, chords, onSongChange, onPracticeChange }: SongPanelProps) {
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

  // Trefferquote je Takt aus allen bisherigen Durchgängen mit diesem Lied und dieser Spur
  const [barStats, setBarStats] = useState<BarStat[]>([]);
  const statsName = loaded.song?.name;
  useEffect(() => {
    if (!statsName || song.track < 0) return void setBarStats([]);
    let alive = true;
    api.getSongStats(tuned.id, statsName, song.track).then((r) => alive && setBarStats(r.bars ?? []));
    return () => {
      alive = false;
    };
  }, [tuned.id, statsName, song.track]);
  const statByBar = new Map(barStats.map((b) => [b.bar, b]));
  const problems = problemBars(barStats);
  const practiseBars = (from: number, to: number) => set({ barFrom: from, barTo: to === bars - 1 ? -1 : to, loop: true });

  return (
    <div className="song-panel">
      <div className="song-row">
        <button onClick={() => api.openSongFile(folderOf(song.path || song.recent[0]?.path || "")).then(choose)}>{t("Lied öffnen …")}</button>
        {song.recent.length > 0 && (
          <select aria-label={t("Zuletzt geöffnet")} value={song.path}
                  onChange={(e) => {
                    const r = song.recent.find((x) => x.path === e.target.value);
                    if (r) set({ path: r.path, name: r.name, track: -1, barFrom: 0, barTo: -1, recent: withRecent(song.recent, r) });
                  }}>
            {!song.path && <option value="">{t("Zuletzt geöffnet …")}</option>}
            {song.recent.map((r) => <option key={r.path} value={r.path}>{r.name}</option>)}
          </select>
        )}
        {loaded.loading && <span className="hint">{t("Lied wird gelesen …")}</span>}
        {loaded.error && <span className="bad">{loaded.error}</span>}
      </div>

      {info && (
        <>
          <p className="song-title">
            <strong>{info.title || loaded.song!.name}</strong>
            {info.artist && <span className="hint"> · {info.artist}</span>}
            <span className="hint"> · {t("{n} Takte", { n: bars })}</span>
          </p>
          <div className="song-row">
            <label>
              <span>{t("Spur")}</span>
              <select value={song.track} onChange={(e) => set({ track: Number(e.target.value) })}>
                {info.tracks.map((tr) => (
                  <option key={tr.index} value={tr.index} disabled={tr.percussion || tr.tuning.length === 0}>
                    {tr.name || t("Spur {n}", { n: tr.index + 1 })}
                    {tr.tuning.length > 0 ? " " + t("({n} Saiten, {tuning})", { n: tr.tuning.length, tuning: tuningText(tr.tuning) })
                      : tr.percussion ? " " + t("(Schlagzeug)") : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("Takte")}</span>
              <select aria-label={t("von Takt")} value={song.barFrom}
                      onChange={(e) => set({ barFrom: Number(e.target.value), barTo: Math.max(Number(e.target.value), barTo) })}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
              </select>
              <span className="hint">{t("bis")}</span>
              <select aria-label={t("bis Takt")} value={barTo}
                      onChange={(e) => set({ barTo: Number(e.target.value) === bars - 1 ? -1 : Number(e.target.value),
                                             barFrom: Math.min(song.barFrom, Number(e.target.value)) })}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
              </select>
            </label>
            <label title={t("Am Ende des Bereichs von vorn beginnen – zum Üben schwieriger Stellen.")}>
              <input type="checkbox" checked={song.loop} onChange={(e) => set({ loop: e.target.checked })} />
              <span>{t("Wiederholen")}</span>
            </label>
          </div>

          {track && songTuning.length > 0 && !tunedMatches && (
            <p className="hint song-warning">
              {t("Die Spur ist für {n} Saiten in {tuning} geschrieben, eingestellt ist {name} in {own}.", {
                n: songTuning.length, tuning: tuningText(songTuning), name: tuned.name, own: tuningText(tuned.strings.map((s) => s.midi)) })}
              {proposed
                ? <> <button onClick={() => onPracticeChange({ ...practice, tuning: proposed })}>{t("Stimmung übernehmen")}</button></>
                : " " + t("Die Griffstellen werden für dein Instrument neu bestimmt.")}
            </p>
          )}
          {bars > 0 && (
            <div className="bar-map" role="group" aria-label={t("Takte (Farbe = Trefferquote, Klick = diesen Takt üben)")}>
              {Array.from({ length: bars }, (_, b) => {
                const st = statByBar.get(b);
                const rate = st ? st.hits / st.attempts : null;
                const inRange = b >= song.barFrom && b <= barTo;
                return (
                  <button key={b} className={`bar-cell ${inRange ? "in-range" : ""}`}
                          style={rate !== null ? { background: rateColor(rate) } : undefined}
                          title={st ? t("Takt {n}: {pct} % von {total}", { n: b + 1, pct: Math.round((rate ?? 0) * 100), total: st.attempts })
                                    : t("Takt {n} – noch nicht geübt", { n: b + 1 })}
                          onClick={() => practiseBars(b, b)} />
                );
              })}
            </div>
          )}
          {problems.length > 0 && (
            <div className="song-row problem-bars">
              <span className="hint">{t("Problemstellen:")}</span>
              {problems.map((p) => (
                <button key={p.bar} onClick={() => practiseBars(Math.max(0, p.bar - 1), Math.min(bars - 1, p.bar + 1))}
                        title={t("Mit dem Takt davor und danach in Schleife üben")}>
                  {t("Takt {n}", { n: p.bar + 1 })} · {Math.round((p.hits / p.attempts) * 100)} %
                </button>
              ))}
            </div>
          )}
          {targets && (
            <p className="hint">
              {targets.targets.length === 1 ? t("1 Ton im Bereich") : t("{n} Töne im Bereich", { n: targets.targets.length })}
              {chords > 0 && " · " + (chords === 1 ? t("davon 1 Akkord (bewertet je Akkordton)") : t("davon {n} Akkorde (bewertet je Akkordton)", { n: chords }))}
              {targets.unplayable > 0 && " · " + (targets.unplayable === 1
                ? t("1 Ton liegt außerhalb deines Instruments und entfällt")
                : t("{n} Töne liegen außerhalb deines Instruments und entfallen", { n: targets.unplayable }))}
              {!targets.ownPositions && targets.targets.length > 0 && " · " + t("Griffstellen selbst bestimmt (tiefster Bund)")}
              {". "}{t("Pausen und Notenlängen entfallen, gespielt wird die reine Tonfolge.")}
            </p>
          )}
        </>
      )}
      {!info && !loaded.loading && !loaded.error && (
        <p className="hint">{t("Öffne eine Guitar-Pro-Datei (.gp, .gpx, .gp5, .gp4, .gp3) und wähle die Spur, die du spielen willst.")}</p>
      )}
    </div>
  );
}
