import { lazy, Suspense } from "react";
import type { Instrument } from "../instruments";
import { MODE_CHOICES } from "../practice/timing";
import { t } from "../i18n";
import { GuideText } from "./GuideText";
import { allExercises, exerciseFile, type CourseModule, type ModuleExercise } from "./modules";

const ScorePreview = lazy(() => import("./ScorePreview"));

interface ExerciseGuidePageProps {
  module: CourseModule;
  exercise: ModuleExercise;
  tuned: Instrument;
  onContinue: () => void; // weiter zur Übung
  onStep: (delta: number) => void; // vorige/nächste Übung (wieder mit Anleitung)
  onOverview: () => void;
}

/** Vor jeder Kursübung: Anleitung mit Noten und Tabulatur; „Weiter“ führt zur Übungsseite. */
export function ExerciseGuidePage({ module, exercise, tuned, onContinue, onStep, onOverview }: ExerciseGuidePageProps) {
  const list = allExercises(module);
  const index = list.findIndex((x) => x.exercise.id === exercise.id);
  const lesson = list[index]?.lesson;
  const file = exerciseFile(module.path, exercise.file);
  const mode = MODE_CHOICES.find((c) => c.id === exercise.mode)?.name;
  return (
    <section className="card wide-card guide-page">
      <div className="course-banner-head">
        <span className="hint">
          {t("Kurs")} · {module.title}{lesson ? ` › ${lesson.title}` : ""} · {t("Übung {n} von {total}", { n: index + 1, total: list.length })}
        </span>
        <span className="course-banner-actions">
          <button onClick={() => onStep(-1)} disabled={index <= 0}>◀ {t("Vorige")}</button>
          <button onClick={() => onStep(1)} disabled={index >= list.length - 1}>{t("Nächste")} ▶</button>
          <button onClick={onOverview}>{t("Kursübersicht")}</button>
        </span>
      </div>
      <h2>{exercise.title}</h2>
      {exercise.description && <p>{exercise.description}</p>}
      {exercise.guide && <GuideText guide={exercise.guide} />}
      <p className="hint">
        {mode && t(mode)}
        {exercise.tempo && ` · ${t("Tempo")} ${exercise.tempo.start} %${exercise.tempo.target ? ` → ${exercise.tempo.target} %` : ""}`}
        {exercise.bars && ` · ${t("Takte {from}–{to}", { from: exercise.bars[0], to: exercise.bars[1] })}`}
      </p>
      {file && (
        <Suspense fallback={<p className="hint">{t("Noten werden geladen …")}</p>}>
          <ScorePreview path={file} track={exercise.track} bars={exercise.bars} tuned={tuned} />
        </Suspense>
      )}
      <div className="guide-actions">
        <button className="primary" onClick={onContinue}>{t("Weiter")} ▶</button>
      </div>
    </section>
  );
}
