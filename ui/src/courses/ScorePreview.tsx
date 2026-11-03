// Noten und Tabulatur einer Kursübung (nur ansehen, ohne Wiedergabe); wird mit alphaTab erst bei Bedarf geladen.

import { AlphaTabApi, Settings, StaveProfile } from "@coderline/alphatab";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Instrument } from "../instruments";
import { parseSongFile, songInfo, type Score } from "../song/gpImport";
import { base64ToBytes, suggestTrack } from "../song/songPractice";
import { t, tCore } from "../i18n";

interface ScorePreviewProps {
  path: string; // vollständiger Pfad der Übungsdatei
  track: number; // Spur laut Kurs
  bars?: [number, number]; // Taktbereich, 1-basiert
  tuned: Instrument;
}

/** Spur wie auf der Übungsseite: die des Kurses, wenn sie zur Saitenzahl passt, sonst die passendste. */
function previewTrack(score: Score, track: number, tuned: Instrument): number {
  const info = songInfo(score);
  const current = info.tracks[track];
  if (current && current.tuning.length === tuned.strings.length) return track;
  const best = suggestTrack(info.tracks, tuned);
  return best >= 0 ? best : Math.min(track, score.tracks.length - 1);
}

export default function ScorePreview({ path, track, bars, tuned }: ScorePreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let at: AlphaTabApi | null = null;
    setError(null);
    setLoading(true);
    api.readSongFile(path).then((file) => {
      if (!alive || !host.current) return;
      if (!file || file.error || !file.data) {
        setError(file?.error ? tCore(file.error) : t("keine Daten"));
        setLoading(false);
        return;
      }
      let score: Score;
      try {
        score = parseSongFile(file.path, base64ToBytes(file.data));
      } catch (e) {
        setError(t("nicht lesbar ({reason})", { reason: e instanceof Error ? e.message : String(e) }));
        setLoading(false);
        return;
      }
      const s = new Settings();
      s.core.fontDirectory = new URL("font/", document.baseURI).href;
      s.display.scale = 0.9;
      s.display.staveProfile = StaveProfile.ScoreTab; // Noten und Tabulatur
      s.player.enablePlayer = false;
      if (bars) {
        s.display.startBar = bars[0];
        s.display.barCount = bars[1] - bars[0] + 1;
      }
      at = new AlphaTabApi(host.current, s);
      at.error.on((e) => setError(e.message));
      at.renderFinished.on(() => setLoading(false));
      at.load(score, [previewTrack(score, track, tuned)]);
    });
    return () => {
      alive = false;
      at?.destroy();
    };
  }, [path, track, bars?.[0], bars?.[1], tuned.id]);

  return (
    <>
      {loading && !error && <p className="hint">{t("Noten werden geladen …")}</p>}
      {error && <p className="bad">{error}</p>}
      <div className="song-score guide-score"><div ref={host} /></div>
    </>
  );
}
