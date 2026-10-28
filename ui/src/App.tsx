import { useEffect, useMemo, useState } from "react";
import { api, type AppSettings } from "./api";
import { isNative } from "./juce";
import { CalibrationHint } from "./calibration/CalibrationHint";
import { CalibrationPage } from "./calibration/CalibrationPage";
import { DetectionSettings } from "./components/DetectionSettings";
import { InstrumentSelect } from "./components/InstrumentSelect";
import { instrumentById, type Instrument } from "./instruments";
import { DeviceSettings } from "./components/DeviceSettings";
import { InputSettings } from "./components/InputSettings";
import { NoiseGateSettings } from "./components/NoiseGateSettings";
import { LevelMeter } from "./components/LevelMeter";
import { SoundFontSettings } from "./components/SoundFontSettings";
import { SupportPage } from "./components/SupportPage";
import { Tuner } from "./components/Tuner";
import { tunedInstrument } from "./music/tunings";
import { PracticePage } from "./practice/PracticePage";
import { StatsPage } from "./stats/StatsPage";
import { EffectsPage } from "./effects/EffectsPage";
import { CoursesPage } from "./courses/CoursesPage";
import { allExercises, courseSongSettings, exerciseFile, readModule, type ActiveExercise, type CourseModule, type ModuleExercise } from "./courses/modules";
import { difficultyOf, practiceFor, saveDifficulty, savePractice, type InstrumentPractice, type UiSettings } from "./practice/settings";
import { saveTiming, timingOf } from "./practice/timing";
import { saveSong, songOf, type SongSettings } from "./song/songPractice";
import { saveScale, scaleOf } from "./practice/ScalePanel";
import { rhythmOf, saveRhythm } from "./practice/rhythmSettings";
import { detectLang, getLang, isLang, LANGUAGES, setLang, t, type Lang } from "./i18n";
import { RecordButton, RecordingPage } from "./recording/RecordingPage";
import { recordingOf, saveRecording } from "./recording/settings";
import { useRecorder } from "./recording/useRecorder";

type Page = "practice" | "courses" | "stats" | "tuner" | "effects" | "recording" | "settings";
type SettingsTab = "audio" | "calibration" | "support";

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ui, setUi] = useState<UiSettings | null>(null);
  const [page, setPage] = useState<Page>("practice");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("audio");
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [courseStart, setCourseStart] = useState(0); // je „Üben“/„Nächste“ eins weiter: Übung startet sofort
  const [courseOpen, setCourseOpen] = useState(false); // Reiter „Kurse“ zeigt die Übung statt der Übersicht
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getUiSettings().then((u) => {
      // Frühere Version hat Kursübungen in die Einstellungen von „Üben“ geschrieben: dort wieder das zuletzt
      // geöffnete Lied (bzw. Zufall) einsetzen
      const a = u["course.active"] as ActiveExercise | undefined;
      const s = songOf(u);
      if (a && s.path === a.file) {
        const r = s.recent[0];
        u = saveSong(u, { ...s, source: r ? "song" : "random", path: r?.path ?? "", name: r?.name ?? "", track: -1, barFrom: 0, barTo: -1 });
      }
      // Sprache: gespeicherte Wahl, sonst die des Systems (auch für Meldungen und Dialoge des Kerns speichern)
      const l = isLang(u.language) ? u.language : detectLang();
      if (!isLang(u.language)) api.setUiSetting("language", l);
      setLang(l);
      setLangState(l);
      setUi({ ...u, language: l });
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

  if (!settings || !ui || !practice || !recording) return <div className="app" />;

  const changeLang = (l: Lang) => {
    setLang(l);
    setLangState(l);
    api.setUiSetting("language", l);
    setUi({ ...ui, language: l });
  };

  const update = (patch: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const setNoiseGate = (noiseGate: AppSettings["noiseGate"]) => {
    update({ noiseGate });
    api.setNoiseGate(noiseGate);
  };

  const setDetection = async (detection: AppSettings["detection"]) => {
    update({ detection });
    await api.setDetectionConfig(detection);
  };

  // Lädt das Profil des Instruments (Tonbereich, Erkennungsparameter); neue Profile starten
  // mit dem Standardbereich des Instruments in seiner gespeicherten Stimmung
  const selectInstrument = async (id: string) => {
    const inst = instrumentById(id);
    const t = tunedInstrument(inst, practiceFor(ui, inst).tuning);
    setSettings(await api.setInstrument(inst.id, t.minHz, t.maxHz));
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
    setCourseStart((n) => n + 1);
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

  const openCalibration = () => {
    setPage("settings");
    setSettingsTab("calibration");
  };

  return (
    <div className="app" key={lang}>
      <header className="app-header">
        <h1>Fretboard Trainer</h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={page === "practice"} onClick={() => setPage("practice")}>{t("Üben")}</button>
          <button role="tab" aria-selected={page === "courses"} onClick={() => setPage("courses")}>{t("Kurse")}</button>
          <button role="tab" aria-selected={page === "stats"} onClick={() => setPage("stats")}>{t("Statistik")}</button>
          <button role="tab" aria-selected={page === "tuner"} onClick={() => setPage("tuner")}>{t("Stimmgerät")}</button>
          <button role="tab" aria-selected={page === "effects"} onClick={() => setPage("effects")}>{t("Effekte")}</button>
          <button role="tab" aria-selected={page === "recording"} onClick={() => setPage("recording")}>{t("Aufnahme")}</button>
          <button role="tab" aria-selected={page === "settings"} onClick={() => setPage("settings")}>{t("Einstellungen")}</button>
        </nav>
        {page === "settings" && (
          <nav className="tabs sub" role="tablist">
            <button role="tab" aria-selected={settingsTab === "audio"} onClick={() => setSettingsTab("audio")}>
              {t("Audio & Erkennung")}
            </button>
            <button role="tab" aria-selected={settingsTab === "calibration"} onClick={() => setSettingsTab("calibration")}>
              {t("Kalibrierung")}
            </button>
            <button role="tab" aria-selected={settingsTab === "support"} onClick={() => setSettingsTab("support")}>
              {t("Unterstützen")}
            </button>
          </nav>
        )}
        {!isNative && <span className="badge">{t("Vorschau ohne Audio-Kern")}</span>}
        <RecordButton rec={rec} settings={recording} onOpen={() => setPage("recording")} />
        <select className="lang-select" value={lang} aria-label={t("Sprache")} title={t("Sprache")}
                onChange={(e) => changeLang(e.target.value as Lang)}>
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {settings.version && <span className="app-version" title={t("Version (öffentlich.Beta.intern)")}>v{settings.version}</span>}
      </header>

      <main className="layout">
        {page === "settings" && (
          <section className="card meter-card">
            <h2>{t("Pegel")}</h2>
            <LevelMeter
              gate={settings.noiseGate}
              onThresholdChange={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })}
            />
          </section>
        )}

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

        {page === "courses" && courseOpen && course && (
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

        {page === "settings" && settingsTab === "calibration" && (
          <CalibrationPage
            settings={settings}
            instrument={tuned}
            onSelectInstrument={selectInstrument}
            onApplyGate={(thresholdDb) => setNoiseGate({ ...settings.noiseGate, thresholdDb })}
            timing={timingOf(ui)}
            onApplyOffset={(offsetMs) => setUi(saveTiming(ui, { ...timingOf(ui), offsetMs }))}
          />
        )}

        {page === "settings" && settingsTab === "support" && <SupportPage />}

        {page === "settings" && settingsTab === "audio" && (
          <>
            <section className="card">
              <h2>{t("Audio-Gerät")}</h2>
              <DeviceSettings />
            </section>

            <section className="card">
              <h2>{t("Klang der Liedwiedergabe")}</h2>
              <SoundFontSettings />
            </section>

            <section className="card">
              <h2>{t("Eingang & Mithören")}</h2>
              <InputSettings
                inputGainDb={settings.inputGainDb}
                monitoring={settings.monitoring}
                onInputGainChange={(inputGainDb) => {
                  update({ inputGainDb });
                  api.setInputGain(inputGainDb);
                }}
                onMonitoringChange={(monitoring) => {
                  update({ monitoring });
                  api.setMonitoring(monitoring.on, monitoring.volumeDb);
                }}
              />
            </section>

            <section className="card">
              <h2>{t("Noisegate")}</h2>
              <NoiseGateSettings params={settings.noiseGate} onChange={setNoiseGate} />
            </section>

            <section className="card wide-card">
              <h2>{t("Instrument & Tonerkennung")}</h2>
              <div className="fields">
                <InstrumentSelect instrument={tuned} onChange={selectInstrument} />
                <DetectionSettings config={settings.detection} instrument={tuned} onChange={setDetection} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
