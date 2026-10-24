import { allExercises, type CourseModule, type ModuleExercise } from "./modules";

interface CourseBannerProps {
  module: CourseModule;
  exercise: ModuleExercise;
  onStep: (delta: number) => void; // vorige/nächste Übung
  onOverview: () => void;
}

/** Auf der Übungsseite: welche Kursübung gerade geübt wird, mit Beschreibung und Weiterschalten. */
export function CourseBanner({ module, exercise, onStep, onOverview }: CourseBannerProps) {
  const list = allExercises(module);
  const index = list.findIndex((x) => x.exercise.id === exercise.id);
  const lesson = list[index]?.lesson;
  return (
    <section className="card wide-card course-banner">
      <div className="course-banner-head">
        <span className="hint">Kurs · {module.title}{lesson ? ` › ${lesson.title}` : ""} · Übung {index + 1} von {list.length}</span>
        <span className="course-banner-actions">
          <button onClick={() => onStep(-1)} disabled={index <= 0}>◀ Vorige</button>
          <button onClick={() => onStep(1)} disabled={index >= list.length - 1}>Nächste ▶</button>
          <button onClick={onOverview}>Kursübersicht</button>
        </span>
      </div>
      <strong>{exercise.title}</strong>
      {exercise.description && <p>{exercise.description}</p>}
    </section>
  );
}
