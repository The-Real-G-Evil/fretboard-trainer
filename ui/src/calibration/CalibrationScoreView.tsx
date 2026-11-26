// Noten und Tabulatur einer Kalibrier-Übung mit wanderndem Strich (wird mit alphaTab erst bei Bedarf geladen).

import { AlphaTabApi, PlayerMode, ScrollMode, Settings, StaveProfile } from "@coderline/alphatab";
import { useEffect, useRef } from "react";
import { parseAlphaTex } from "../song/gpImport";

interface ExternalOutput {
  handler?: unknown;
  updatePosition(ms: number): void;
}

interface CalibrationScoreViewProps {
  tex: string;
  durationMs: number;
  /** performance.now() des ersten Schlags nach dem Vorzähler; null = Strich steht am Anfang. */
  startedAt: number | null;
  onEnd: () => void; // Strich hat das Ende erreicht
}

export default function CalibrationScoreView({ tex, durationMs, startedAt, onEnd }: CalibrationScoreViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const out = useRef<ExternalOutput | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!host.current || !scroller.current) return;
    const s = new Settings();
    s.core.fontDirectory = new URL("font/", document.baseURI).href;
    s.display.scale = 0.9;
    s.display.staveProfile = StaveProfile.ScoreTab;
    s.player.playerMode = PlayerMode.EnabledExternalMedia;
    s.player.scrollElement = scroller.current;
    s.player.scrollMode = ScrollMode.Continuous;
    s.player.enableCursor = true;
    s.player.enableUserInteraction = false;
    const at = new AlphaTabApi(host.current, s);
    at.playerReady.on(() => {
      const o = (at.player as unknown as { output?: ExternalOutput } | null)?.output;
      if (!o) return;
      // alphaTab spielt nichts selbst ab: Die Position kommt vom Zeitgeber der Kalibrierung
      o.handler = { backingTrackDuration: durationMs + 60000, playbackRate: 1, masterVolume: 1, seekTo() {}, play() {}, pause() {} };
      out.current = o;
      o.updatePosition(0);
    });
    at.load(parseAlphaTex(tex));
    return () => {
      at.destroy();
      out.current = null;
    };
  }, [tex]);

  // Strich: ab dem ersten Schlag nach dem Vorzähler mit der Uhr mitlaufen
  useEffect(() => {
    if (startedAt === null) return void out.current?.updatePosition(0);
    let frame = 0;
    let ended = false;
    const step = () => {
      const ms = Math.max(0, performance.now() - startedAt);
      out.current?.updatePosition(Math.min(ms, durationMs));
      if (ms >= durationMs && !ended) {
        ended = true;
        onEndRef.current();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, durationMs]);

  return (
    <div className="song-score calib-score" ref={scroller}>
      <div ref={host} />
    </div>
  );
}
