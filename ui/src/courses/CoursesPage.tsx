import { useEffect, useMemo, useState } from "react";
import { api, type CourseProgress, type ModulesInfo } from "../api";
import type { Instrument } from "../instruments";
import { MODE_CHOICES } from "../practice/timing";
import { t, tCore } from "../i18n";
import {
  allExercises, exerciseKey, instrumentMatches, readModule, type CourseModule, type ModuleExercise,
} from "./modules";

/** Ab dieser Trefferquote gilt eine Übung als geschafft. */
export const DONE_RATE = 0.9;

interface CoursesPageProps {
  tuned: Instrument;
  activeKey: string | null; // gerade geübte Übung
  onStart: (m: CourseModule, e: ModuleExercise) => void;
  onModulesLoaded: (modules: CourseModule[]) => void;
}

/** Kurse aus den Modulordnern: Ordner verwalten, Module mit Lektionen und Übungen, Fortschritt je Übung. */
export function CoursesPage({ tuned, activeKey, onStart, onModulesLoaded }: CoursesPageProps) {
  const [info, setInfo] = useState<ModulesInfo | null>(null);
  const [progress, setProgress] = useState<Map<string, CourseProgress>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);

  const load = (next?: ModulesInfo | null) => {
    if (next === null) return; // Auswahl abgebrochen
    (next ? Promise.resolve(next) : api.getModules()).then(setInfo);
    api.getCourseProgress().then((r) => setProgress(new Map((r.progress ?? []).map((p) => [p.key, p]))));
  };
  useEffect(() => load(), []);

  const parsed = useMemo(() => (info?.modules ?? []).map(readModule), [info]);
  const modules = parsed.filter((m): m is CourseModule => "lessons" in m);
  const broken = parsed.filter((m): m is { path: string; error: string } => !("lessons" in m));
  useEffect(() => onModulesLoaded(modules), [info]);

  const current = modules.find((m) => m.path === selected)
    ?? modules.find((m) => activeKey?.startsWith(`${m.id}/`)) ?? modules[0];
  const done = (m: CourseModule) => allExercises(m).filter(({ exercise }) => (progress.get(exerciseKey(m, exercise))?.bestRate ?? 0) >= DONE_RATE).length;

  if (!info) return <section className="card wide-card"><p className="hint">{t("Kurse werden gesucht …")}</p></section>;

  return (
    <>
      <section className="card wide-card">
        <h2>{t("Kursordner")}</h2>
        <ul className="course-folders">
          {info.folders.map((f) => (
            <li key={f.path}>
              <code>{f.path}</code>
              {f.builtin && <span className="hint">{t("Standardordner")}</span>}
              {!f.exists && <span className="bad">{t("nicht gefunden")}</span>}
              <span className="course-folder-actions">
                <button onClick={() => void api.revealPath(f.path)} disabled={!f.exists}>{t("Öffnen")}</button>
                {!f.builtin && <button onClick={() => api.removeModuleFolder(f.path).then(load)}>{t("Entfernen")}</button>}
              </span>
            </li>
          ))}
        </ul>
        <div className="course-folder-add">
          <button onClick={() => api.addModuleFolder().then(load)}>{t("Ordner hinzufügen …")}</button>
          <button onClick={() => load()}>{t("Neu einlesen")}</button>
          <span className="hint">
            {t("Ein Kurs ist ein Unterordner mit einer Datei module.json und den Übungsdateien (Guitar Pro oder alphaTex). Wie man Kurse erstellt, steht in der Anleitung.")}
          </span>
        </div>
      </section>

      {modules.length === 0 && broken.length === 0 && (
        <section className="card wide-card"><p className="hint">{t("In den Kursordnern wurden noch keine Kurse gefunden.")}</p></section>
      )}

      {(modules.length > 0 || broken.length > 0) && (
        <div className="course-list">
          {modules.map((m) => {
            const total = allExercises(m).length;
            return (
              <button key={m.path} className={`card course-card ${m === current ? "selected" : ""}`} onClick={() => setSelected(m.path)}>
                <strong>{m.title}</strong>
                {m.author && <span className="hint">{m.author}</span>}
                <span className="hint">
                  {m.lessons.length === 1 ? t("1 Lektion") : t("{n} Lektionen", { n: m.lessons.length })}
                  {" · "}{t("{n} Übungen", { n: total })} · {t("{n} geschafft", { n: done(m) })}
                </span>
                <span className="course-bar"><span style={{ width: `${total ? (done(m) / total) * 100 : 0}%` }} /></span>
                {!instrumentMatches(m, tuned.id) && <span className="hint bad">{t("für {instrument}", { instrument: m.instrument ?? "" })}</span>}
              </button>
            );
          })}
          {broken.map((b) => (
            <div key={b.path} className="card course-card broken">
              <strong>{b.path.split(/[\\/]/).pop()}</strong>
              <span className="bad">{tCore(b.error)}</span>
            </div>
          ))}
        </div>
      )}

      {current && (
        <section className="card wide-card course-detail">
          <h2>{current.title}</h2>
          {current.description && <p>{current.description}</p>}
          <p className="hint">
            {[current.author && t("Autor: {name}", { name: current.author }), current.version && t("Version {v}", { v: current.version }),
              current.license && t("Lizenz: {license}", { license: current.license })].filter(Boolean).join(" · ")}
          </p>
          {!instrumentMatches(current, tuned.id) && (
            <p className="hint bad">{t("Dieser Kurs ist für „{instrument}“ geschrieben – du übst gerade mit {name}.", { instrument: current.instrument ?? "", name: tuned.name })}</p>
          )}
          {current.problems.length > 0 && (
            <details className="course-problems">
              <summary className="bad">{t("{n} Hinweise zur module.json", { n: current.problems.length })}</summary>
              <ul>{current.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </details>
          )}
          {current.lessons.map((l, li) => (
            <div key={li} className="course-lesson">
              <h3>{l.title}</h3>
              {l.description && <p className="hint">{l.description}</p>}
              <table className="course-table">
                <tbody>
                  {l.exercises.map((e) => {
                    const key = exerciseKey(current, e);
                    const p = progress.get(key);
                    return (
                      <tr key={e.id} className={key === activeKey ? "active" : ""}>
                        <td className="course-state">{(p?.bestRate ?? 0) >= DONE_RATE ? "✓" : ""}</td>
                        <td>
                          <strong>{e.title}</strong>
                          {e.description && <div className="hint">{e.description}</div>}
                        </td>
                        <td className="hint">
                          {t(MODE_CHOICES.find((c) => c.id === e.mode)?.name ?? "")}
                          {e.tempo && ` · ${e.tempo.start} %${e.tempo.target ? ` → ${e.tempo.target} %` : ""}`}
                        </td>
                        <td className="hint">{p ? `${Math.round(p.bestRate * 100)} % · ${p.sessions}×` : "–"}</td>
                        <td><button className="primary" onClick={() => onStart(current, e)}>{t("Üben")}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
