// Diagnose-Aufnahme beim Üben: der Kern schneidet den Eingang mit, die Oberfläche protokolliert
// erkannte Töne, Zieltöne und gewertete Versuche. Beides zusammen zeigt, welche Erkennung zu welchem
// Fehler geführt hat (z. B. mitklingende leere Saiten). Gespeichert wird unter
// <Dokumente>/Fretboard Trainer/Diagnose als .wav + .json.

import { api, type AttemptRecord, type NoteEvent } from "../api";

export const DIAGNOSTIC_MAX_SEC = 600; // längere Durchgänge werden nur bis hierhin aufgenommen

/** Alle Einträge mit perf = performance.now() beim Eintreffen (gemeinsame Reihenfolge);
    Töne und Versuche zusätzlich mit timeMs/noteTimeMs auf der Stream-Uhr der Aufnahme. */
export type DiagnosticEntry =
  | ({ type: "note"; perf: number } & NoteEvent)
  | { type: "targets"; perf: number; midis: number[] }
  | ({ type: "attempt"; perf: number } & AttemptRecord);

interface Diagnostic {
  meta: Record<string, unknown>;
  entries: DiagnosticEntry[];
  off: () => void;
}

let current: Diagnostic | null = null;

/** Startet Mitschnitt und Protokoll (ein laufendes wird verworfen). */
export function startDiagnostic(meta: Record<string, unknown>) {
  current?.off();
  const d: Diagnostic = { meta, entries: [], off: () => {} };
  d.off = api.onNote((n) => d.entries.push({ type: "note", perf: performance.now(), ...n }));
  current = d;
  api.startRecording("practice", DIAGNOSTIC_MAX_SEC);
}

export function logTargets(midis: number[]) {
  current?.entries.push({ type: "targets", perf: performance.now(), midis });
}

export function logAttempt(a: AttemptRecord) {
  current?.entries.push({ type: "attempt", perf: performance.now(), ...a });
}

/** Beendet den Mitschnitt und speichert ihn, wenn dabei Töne erkannt wurden. */
export async function finishDiagnostic(): Promise<{ path?: string; error?: string } | null> {
  const d = current;
  if (!d) return null;
  current = null;
  d.off();
  await api.stopRecording();
  if (!d.entries.some((e) => e.type === "note")) return null;
  return api.saveDiagnostic({ ...d.meta, entries: d.entries });
}
