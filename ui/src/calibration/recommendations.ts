// Hinweise, was als Nächstes aufgenommen werden sollte – abhängig davon, wie gut die
// bisherigen Aufnahmen gelungen sind (Können des Nutzers) und wie alt sie sind.

import type { CalibrationTake } from "../api";
import type { Exercise } from "./exercises";

export const GOOD_ACCURACY = 0.9; // Stufe gilt als geschafft
export const RETAKE_ACCURACY = 0.75; // darunter: vermutlich Spielfehler -> neu aufnehmen
const STALE_DAYS = 60;

export type RecommendationKind = "measureNoise" | "retake" | "nextLevel" | "stale" | "optimize";

export interface Recommendation {
  kind: RecommendationKind;
  exerciseId?: string;
  text: string;
}

export function latestTakeByExercise(takes: CalibrationTake[], instrument: string) {
  const map = new Map<string, CalibrationTake>();
  for (const t of takes) {
    if (t.instrument !== instrument) continue;
    const prev = map.get(t.exerciseId);
    if (!prev || prev.createdAt < t.createdAt) map.set(t.exerciseId, t);
  }
  return map;
}

export function bestAccuracy(takes: CalibrationTake[], instrument: string, exerciseId: string) {
  return takes
    .filter((t) => t.instrument === instrument && t.exerciseId === exerciseId && t.score)
    .reduce((best, t) => Math.max(best, t.score!.accuracy), -1);
}

/** Höchste Stufe, deren Übungen (und alle darunter) gut aufgenommen sind; 0 = noch keine. */
export function completedLevel(exercises: Exercise[], takes: CalibrationTake[], instrument: string) {
  const levels = [...new Set(exercises.filter((e) => e.kind === "notes").map((e) => e.level))].sort((a, b) => a - b);
  let done = 0;
  for (const level of levels) {
    const ok = exercises
      .filter((e) => e.level === level && e.kind === "notes")
      .every((e) => bestAccuracy(takes, instrument, e.id) >= GOOD_ACCURACY);
    if (!ok) break;
    done = level;
  }
  return done;
}

function retakeReason(t: CalibrationTake) {
  const s = t.score!;
  if (s.missing > s.expected / 3) return "viele Töne fehlen – evtl. zu leise gespielt oder Gate zu hoch";
  if (s.wrongType > s.expected / 3) return "Anschlag und Legato wurden oft verwechselt";
  if (s.wrongPitch > 1) return "einige Töne wurden anders erkannt – evtl. verspielt";
  return "die Aufnahme passt nicht gut zur Vorgabe";
}

export function recommendations(
  exercises: Exercise[],
  takes: CalibrationTake[],
  instrument: string,
  lastOptimizedAt: string | null,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const latest = latestTakeByExercise(takes, instrument);
  const now = Date.now();

  const silence = latest.get("silence");
  if (!silence) {
    recs.push({ kind: "measureNoise", exerciseId: "silence", text: "Grundrauschen messen, um die Gate-Schwelle passend einzustellen." });
  } else if (silence.noise?.quiet === false) {
    recs.push({ kind: "retake", exerciseId: "silence", text: "„Ruhe messen“ wiederholen – bei der letzten Messung klang noch etwas." });
  }

  for (const e of exercises) {
    const t = latest.get(e.id);
    if (!t?.score) continue;
    if (t.score.accuracy < RETAKE_ACCURACY) {
      recs.push({
        kind: "retake",
        exerciseId: e.id,
        text: `„${e.title}“ erneut aufnehmen (${Math.round(t.score.accuracy * 100)} %): ${retakeReason(t)}.`,
      });
    }
  }

  const done = completedLevel(exercises, takes, instrument);
  const next = exercises.filter((e) => e.level === done + 1 && e.kind === "notes");
  const retakeIds = new Set(recs.filter((r) => r.kind === "retake").map((r) => r.exerciseId));
  const nextOpen = next.filter((e) => bestAccuracy(takes, instrument, e.id) < GOOD_ACCURACY && !retakeIds.has(e.id));
  const levelStarted = next.some((e) => latest.has(e.id));
  const anyNotesTake = [...latest.values()].some((t) => t.kind === "notes");
  const titles = nextOpen.map((e) => e.title).join("“ und „");

  if (nextOpen.length > 0) {
    recs.push({
      kind: "nextLevel",
      exerciseId: nextOpen[0].id,
      text: !anyNotesTake
        ? `Mit „${nextOpen[0].title}“ beginnen.`
        : levelStarted
          ? `Stufe ${done + 1} abschließen: „${titles}“ aufnehmen.`
          : `Stufe ${done} geschafft – weiter mit Stufe ${done + 1}: „${titles}“.`,
    });
  }

  for (const t of latest.values()) {
    const ageDays = (now - Date.parse(t.createdAt)) / 86_400_000;
    if (ageDays > STALE_DAYS && (!t.score || t.score.accuracy >= RETAKE_ACCURACY)) {
      recs.push({
        kind: "stale",
        exerciseId: t.exerciseId,
        text: `„${t.title}“ ist älter als ${STALE_DAYS} Tage – neu aufnehmen, falls sich Saiten, Tonabnehmer oder Interface geändert haben.`,
      });
    }
  }

  const newestNotes = takes
    .filter((t) => t.kind === "notes" && t.score)
    .reduce<string | null>((max, t) => (max === null || t.createdAt > max ? t.createdAt : max), null);
  if (newestNotes && (!lastOptimizedAt || lastOptimizedAt < newestNotes)) {
    recs.push({ kind: "optimize", text: "Neue Aufnahmen vorhanden – Erkennungsparameter optimieren." });
  }

  return recs;
}
