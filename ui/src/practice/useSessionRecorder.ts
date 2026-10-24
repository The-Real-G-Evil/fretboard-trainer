import { useEffect, useRef } from "react";
import { api, type AttemptRecord, type ReviewPayload } from "../api";
import { logAttempt } from "./diagnostics";
import { clearReview, finishReview } from "./review";

export interface SessionInfo {
  instrument: string;
  difficulty: string;
  mode: string;
  tempo: string;
  bpm: number;
  dynamicsWindowDb?: number; // nur mit Lautstärke-Bewertung
  source?: "random" | "gp" | "scale" | "course"; // Notenquelle
  gpFile?: string; // Name des Lieds
  gpTrack?: number; // Spur im Lied
}

/** Zeichnet einen Übungsdurchgang in der Statistik auf: startet beim Einhängen, beendet beim
    Aushängen (Durchgänge ohne Versuche verwirft der Kern). Versuche vor dem Start der
    Datenbank-Sitzung werden gepuffert. Der Kern schneidet den Durchgang mit; am Ende liefert
    `review` die erwarteten Noten mit Live-Wertung für die Nachanalyse. */
export function useSessionRecorder(info: SessionInfo, scoreRef: { current: number }, review?: () => ReviewPayload | null) {
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const sessionId = useRef<number | null>(null);
  const pending = useRef<AttemptRecord[]>([]);
  const startedAt = useRef(performance.now());

  useEffect(() => {
    let alive = true;
    let id: number | null = null;
    startedAt.current = performance.now();
    clearReview();
    void api.runRecordingStart();
    let payload: ReviewPayload | null = null;
    // erst beenden (Durchgang ohne Versuche entfällt), dann nachanalysieren
    const end = (sessionId: number) =>
      api.statsEndSession(sessionId, { score: scoreRef.current, durationSec: (performance.now() - startedAt.current) / 1000 })
        .then(() => finishReview(sessionId, payload));

    api.statsStartSession(info).then((r) => {
      if (r.id === undefined) { // ohne Statistik weiterüben
        if (!alive) finishReview(null, null);
        return;
      }
      id = r.id;
      if (!alive) {
        void end(id);
        return;
      }
      sessionId.current = id;
      for (const a of pending.current) api.statsAddAttempt(id, a);
      pending.current = [];
    });

    return () => {
      alive = false;
      payload = reviewRef.current?.() ?? null;
      if (id !== null) void end(id);
      sessionId.current = null;
    };
  }, []);

  return (attempt: AttemptRecord) => {
    logAttempt(attempt);
    if (sessionId.current !== null) api.statsAddAttempt(sessionId.current, attempt);
    else pending.current.push(attempt);
  };
}
