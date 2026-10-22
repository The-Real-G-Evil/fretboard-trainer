import { useEffect, useRef } from "react";
import { api, type AttemptRecord } from "../api";
import { logAttempt } from "./diagnostics";

export interface SessionInfo {
  instrument: string;
  difficulty: string;
  mode: string;
  tempo: string;
  bpm: number;
  dynamicsWindowDb?: number; // nur mit Lautstärke-Bewertung
  source?: "random" | "gp"; // Notenquelle
  gpFile?: string; // Name des Lieds
  gpTrack?: number; // Spur im Lied
}

/** Zeichnet einen Übungsdurchgang in der Statistik auf: startet beim Einhängen, beendet beim
    Aushängen (Durchgänge ohne Versuche verwirft der Kern). Versuche vor dem Start der
    Datenbank-Sitzung werden gepuffert. */
export function useSessionRecorder(info: SessionInfo, scoreRef: { current: number }) {
  const sessionId = useRef<number | null>(null);
  const pending = useRef<AttemptRecord[]>([]);
  const startedAt = useRef(performance.now());

  useEffect(() => {
    let alive = true;
    let id: number | null = null;
    startedAt.current = performance.now();

    api.statsStartSession(info).then((r) => {
      if (r.id === undefined) return; // ohne Statistik weiterüben
      id = r.id;
      if (!alive) {
        api.statsEndSession(id, { score: scoreRef.current, durationSec: (performance.now() - startedAt.current) / 1000 });
        return;
      }
      sessionId.current = id;
      for (const a of pending.current) api.statsAddAttempt(id, a);
      pending.current = [];
    });

    return () => {
      alive = false;
      if (id !== null)
        api.statsEndSession(id, { score: scoreRef.current, durationSec: (performance.now() - startedAt.current) / 1000 });
      sessionId.current = null;
    };
  }, []);

  return (attempt: AttemptRecord) => {
    logAttempt(attempt);
    if (sessionId.current !== null) api.statsAddAttempt(sessionId.current, attempt);
    else pending.current.push(attempt);
  };
}
