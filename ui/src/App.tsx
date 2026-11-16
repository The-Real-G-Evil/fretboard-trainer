import { useEffect, useMemo, useState } from "react";
import { api, type AppSettings } from "./api";
import { isNative } from "./juce";
import { CalibrationHint } from "./calibration/CalibrationHint";
import { instrumentById, type Instrument } from "./instruments";
import { Tuner } from "./components/Tuner";
import { tunedInstrument } from "./music/tunings";
import { PracticePage } from "./practice/PracticePage";
import { StatsPage } from "./stats/StatsPage";
import { EffectsPage } from "./effects/EffectsPage";
import { CoursesPage } from "./courses/CoursesPage";
import { ExerciseGuidePage } from "./courses/ExerciseGuidePage";
import { allExercises, courseSongSettings, exerciseFile, readModule, type ActiveExercise, type CourseModule, type ModuleExercise } from "./courses/modules";
import { difficultyOf, practiceFor, saveDifficulty, savePractice, type InstrumentPractice, type UiSettings } from "./practice/settings";
import { saveTiming, timingOf } from "./practice/timing";
import { saveSong, songOf, type SongSettings } from "./song/songPractice";
import { saveScale, scaleOf } from "./practice/ScalePanel";
import { rhythmOf, saveRhythm } from "./practice/rhythmSettings";
import { LANGUAGES, t, type Lang } from "./i18n";
import { RecordButton, RecordingPage } from "./recording/RecordingPage";
import { recordingOf, saveRecording } from "./recording/settings";
import { useRecorder } from "./recording/useRecorder";
import { checkForUpdate } from "./update/updateCheck";
import { UpdateBanner } from "./update/UpdateViews";
import { CableBanner } from "./components/CableBanner";
import { AppToolbar, ToolbarIcon, type Page } from "./components/AppToolbar";
import { PLATFORM, useSharedSettings } from "./sharedSettings";
import { appearanceOf, useAppearance } from "./theme";

// Frühere Version hat Kursübungen in die Einstellungen von „Üben“ geschrieben: dort wieder das zuletzt
// geöffnete Lied (bzw. Zufall) einsetzen
function migrateUi(u: UiSettings): UiSettings {
  const a = u["course.active"] as ActiveExercise | undefined;
  const s = songOf(u);
  if (a && s.path === a.file) {
    const r = s.recent[0];
    return saveSong(u, { ...s, source: r ? "song" : "random", path: r?.path ?? "", name: r?.name ?? "", track: -1, barFrom: 0, barTo: -1 });
  }
  return u;
}

/** Einstellungen öffnen: macOS über das App-Menü (⌘,), sonst Zahnrad und Strg+, – die Tastenkombination
    auch hier abfangen, weil die WebView sie sonst schluckt. */
function useSettingsShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "," && (PLATFORM === "mac" ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        void api.openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const { settings, setSettings, ui, setUi, lang } = useSharedSettings(migrateUi);
  const [page, setPage] = useState<Page>("practice");
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [courseGuide, setCourseGuide] = useState(false); // vor jeder Kursübung erst die Anleitung zeigen
  const [courseStart, setCourseStart] = useState(0); // je „Weiter“ auf der Anleitung eins weiter: Übung startet sofort
  const [courseOpen, setCourseOpen] = useState(false); // Reiter „Kurse“ zeigt die Übung statt der Übersicht
  useSettingsShortcut();
  useAppearance(appearanceOf(ui));

  useEffect(() => {
    // Neue Version auf GitHub? (abschaltbar; Fehler bleiben still)
    Promise.all([api.getSettings(), api.getUiSettings()]).then(([s, u]) => {
      if (u["update.autoCheck"] !== false && s.version) void checkForUpdate(s.version);
    });
    // Kurse gleich beim Start einlesen: die zuletzt geübte Kursübung erscheint auf der Übungsseite
    api.getModules().then((info) => setModules(info.modules.map(readModule).filter((m): m is CourseModule => "lessons" in m)));
  }, []);

  const instrument = instrumentById(settings?.instrument ?? "");
  const practice = ui ? practiceFor(ui, instrument) : null;
  const tuningKey = practice ? practice.tuning.offsets.join(",") : "";
  // Gestimmtes Instrument stabil halten, damit Übung und Griffbrett nicht bei jedem Rendern neu starten
  const tuned = useMemo(
    () => (practice ? tunedInstrument(instrument, practice.tuning) : instrument),
    [instrument, tuningKey, lang], // Sprache: Saitennamen (H/B)
  );

  // Aufnahme lebt hier, damit Seiten- und Sprachwechsel sie nicht beenden
  const recording = ui ? recordingOf(ui) : null;
  const rec = useRecorder(recording, tuned, ui ? timingOf(ui).offsetMs : 0);

  if (!settings || !ui || !practice || !recording) return <div className="app-shell" />;

  const changeLang = (l: Lang) => {
    api.setUiSetting("language", l);
    setUi({ ...ui, language: l });
  };

  const update = (patch: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const setDetection = async (detection: AppSettings["detection"]) => {
    update({ detection });
    await api.setDetectionConfig(detection);
  };

  const changePractice = (p: InstrumentPractice) => {
    const before: Instrument = tuned;
    const after = tunedInstrument(instrument, p.tuning);
    setUi(savePractice(ui, instrument.id, p));

    // Stand der Tonbereich auf dem Standard der alten Stimmung, folgt er der neuen
    const d = settings.detection;
    if (d.minHz === before.minHz && d.maxHz === before.maxHz && (after.minHz !== d.minHz || after.maxHz !== d.maxHz))
      setDetection({ ...d, minHz: after.minHz, maxHz: after.maxHz });
  };

  // Kurse: Übungen laufen im Reiter „Kurse“ mit eigenen Einstellungen („course.song“, Spielmodus aus dem Kurs);
  // der Reiter „Üben“ (Zufall, Tonleiter, Lieder) bleibt davon unberührt
  const active = ui["course.active"] as ActiveExercise | undefined;
  // Metronom bei Kursen standardmäßig an (Übungen sind meist Einzelspuren ohne Begleitung)
  const courseSong = songOf({ "practice.song": { metronome: true, ...(ui["course.song"] as object | undefined) } });
  const saveCourseSong = (s: SongSettings) => {
    api.setUiSetting("course.song", s);
    setUi({ ...ui, "course.song": s });
  };
  const startExercise = (m: CourseModule, e: ModuleExercise) => {
    const file = exerciseFile(m.path, e.file);
    if (!file) return;
    const s = courseSongSettings(courseSong, m, e);
    const a: ActiveExercise = { modulePath: m.path, moduleId: m.id, exerciseId: e.id, file };
    api.setUiSetting("course.song", s);
    api.setUiSetting("course.active", a);
    setUi({ ...ui, "course.song": s, "course.active": a });
    setCourseGuide(true);
    setCourseOpen(true);
    setPage("courses");
  };
  const activeModule = active ? modules.find((m) => m.path === active.modulePath) : undefined;
  const activeExercise = activeModule?.lessons.flatMap((l) => l.exercises).find((e) => e.id === active?.exerciseId);
  const course = activeModule && activeExercise && courseSong.path === active?.file
    ? { module: activeModule, exercise: activeExercise } : null;
  // Spielmodus gibt die Übung vor; andere Änderungen (Lautstärke, Ausgleich) gelten wie beim Üben
  const courseTiming = { ...timingOf(ui), mode: course?.exercise.mode ?? "auto" };
  const stepCourse = (delta: number) => {
    if (!course) return;
    const list = allExercises(course.module);
    const target = list[list.findIndex((x) => x.exercise.id === course.exercise.id) + delta];
    if (target) startExercise(course.module, target.exercise);
  };

  const openCalibration = () => void api.openSettings("calibration");

  return (
    <div className="app-shell" key={lang}>
      <AppToolbar page={page} onPage={setPage} end={
        <>
          {!isNative && <span className="badge">{t("Vorschau ohne Audio-Kern")}</span>}
          <RecordButton rec={rec} settings={recording} onOpen={() => setPage("recording")} />
          <select className="lang-select" value={lang} aria-label={t("Sprache")} title={t("Sprache")}
                  onChange={(e) => changeLang(e.target.value as Lang)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {settings.version && <span className="app-version" title={t("Version (öffentlich.Beta.intern)")}>v{settings.version}</span>}
          {PLATFORM !== "mac" && (
            <button className="toolbar-tab settings-button" onClick={() => void api.openSettings()}
                    title={t("Einstellungen (Strg+,)")} aria-label={t("Einstellungen")}>
              <ToolbarIcon name="settings" />
            </button>
          )}
        </>
      } />

      <div className="app">
      <main className="layout">
        <UpdateBanner />
        <CableBanner onOpenCalibration={openCalibration} />

        {page === "recording" && (
          <RecordingPage rec={rec} settings={recording} onChange={(r) => setUi(saveRecording(ui, r))} />
        )}

        {page === "practice" && (
          <>
            <CalibrationHint instrument={tuned} onOpen={openCalibration} />
            <PracticePage
              instrument={instrument}
              tuned={tuned}
              practice={practice}
              difficulty={difficultyOf(ui)}
              timing={timingOf(ui)}
              centsTolerance={settings.detection.centsTolerance}
              onPracticeChange={changePractice}
              onDifficultyChange={(d) => setUi(saveDifficulty(ui, d))}
              onTimingChange={(t) => setUi(saveTiming(ui, t))}
              song={songOf(ui)}
              onSongChange={(s) => setUi(saveSong(ui, s))}
              scale={scaleOf(ui)}
              onScaleChange={(s) => setUi(saveScale(ui, s))}
              rhythm={rhythmOf(ui)}
              onRhythmChange={(r) => setUi(saveRhythm(ui, r))}
            />
          </>
        )}

        {page === "courses" && courseOpen && course && courseGuide && (
          <ExerciseGuidePage module={course.module} exercise={course.exercise} tuned={tuned}
                             onContinue={() => {
                               setCourseGuide(false);
                               setCourseStart((n) => n + 1);
                             }} onStep={stepCourse} onOverview={() => setCourseOpen(false)} />
        )}
        {page === "courses" && courseOpen && course && !courseGuide && (
          <PracticePage
            instrument={instrument}
            tuned={tuned}
            practice={practice}
            difficulty={difficultyOf(ui)}
            timing={courseTiming}
            centsTolerance={settings.detection.centsTolerance}
            onPracticeChange={changePractice}
            onDifficultyChange={(d) => setUi(saveDifficulty(ui, d))}
            onTimingChange={(t) => setUi(saveTiming(ui, { ...t, mode: timingOf(ui).mode }))}
            song={courseSong}
            onSongChange={saveCourseSong}
            scale={scaleOf(ui)}
            onScaleChange={(s) => setUi(saveScale(ui, s))}
            rhythm={rhythmOf(ui)}
            onRhythmChange={(r) => setUi(saveRhythm(ui, r))}
            course={course}
            onCourseStep={stepCourse}
            onOpenCourses={() => setCourseOpen(false)}
            autoStart={courseStart}
          />
        )}
        {page === "courses" && !(courseOpen && course) && (
          <CoursesPage tuned={tuned} activeKey={course ? `${course.module.id}/${course.exercise.id}` : null}
                       onStart={startExercise} onModulesLoaded={setModules} />
        )}

        {page === "stats" && <StatsPage instrument={tuned} clef={practice.clef} />}

        {page === "effects" && (
          <EffectsPage ui={ui} onUiChange={setUi} monitoring={settings.monitoring}
                       onMonitoringChange={(monitoring) => {
                         update({ monitoring });
                         api.setMonitoring(monitoring.on, monitoring.volumeDb);
                       }} />
        )}

        {page === "tuner" && (
          <>
            <CalibrationHint instrument={tuned} onOpen={openCalibration} />
            <Tuner centsTolerance={settings.detection.centsTolerance} instrumentName={instrument.name} />
          </>
        )}

      </main>
      </div>
    </div>
  );
}
