import { useEffect, useState } from "react";
import { api, type AudioFormat, type RecordingInfo } from "../api";
import { t, tKey } from "../i18n";
import { AUDIO_FORMATS, BITRATES, missingChoice, type RecordingSettings } from "./settings";
import type { Recorder } from "./useRecorder";

const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

const MISSING = {
  target: tKey("Wähle mindestens ein Ziel."),
  signal: tKey("Wähle für die Audiodateien mindestens ein Signal."),
  align: tKey("Wähle für Guitar Pro, ob am Metronom ausgerichtet oder das Tempo geschätzt werden soll."),
  midi: tKey("Wähle einen MIDI-Ausgang."),
};

/** Laufzeit der Aufnahme, sekündlich aktualisiert. */
export function useElapsed(rec: Recorder) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (rec.phase !== "recording") return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [rec.phase]);
  return rec.phase === "recording" ? formatTime((performance.now() - rec.startedAt) / 1000) : "";
}

/** Knopf für die Kopfzeile: startet mit den gespeicherten Einstellungen, sonst öffnet er die Seite. */
export function RecordButton({ rec, settings, onOpen }: { rec: Recorder; settings: RecordingSettings; onOpen: () => void }) {
  const elapsed = useElapsed(rec);
  const recording = rec.phase === "recording";
  const busy = rec.phase === "starting" || rec.phase === "saving";
  const click = () => (recording ? rec.stop() : missingChoice(settings) ? onOpen() : rec.start());
  return (
    <button className={`record-button${recording ? " on" : ""}`} onClick={click} disabled={busy}
            title={recording ? t("Aufnahme beenden") : t("Aufnahme starten")}>
      <span className="record-icon" aria-hidden />
      {recording ? elapsed : busy ? t("Speichern …") : t("Aufnahme")}
    </button>
  );
}

export function RecordingPage({ rec, settings, onChange }: {
  rec: Recorder;
  settings: RecordingSettings;
  onChange: (r: RecordingSettings) => void;
}) {
  const [info, setInfo] = useState<RecordingInfo | null>(null);
  const elapsed = useElapsed(rec);
  useEffect(() => void api.getRecordingInfo().then(setInfo), []);

  const r = settings;
  const set = (patch: Partial<RecordingSettings>) => onChange({ ...r, ...patch });
  const toggleFormat = (id: AudioFormat, on: boolean) =>
    set({ formats: AUDIO_FORMATS.map((f) => f.id).filter((f) => (f === id ? on : r.formats.includes(f))) });
  const locked = rec.phase !== "idle";
  const missing = missingChoice(r);
  const outputs = info?.midiOutputs ?? [];

  const chooseFolder = async () => {
    const res = await api.chooseRecordingFolder();
    if (res) setInfo((i) => (i ? { ...i, folder: res.folder } : i));
  };

  return (
    <div className="recording">
      <section className="card recording-main">
        <h2>{t("Aufnahme")}</h2>
        <div className="recording-controls">
          {rec.phase === "recording" ? (
            <button className="record-button big on" onClick={rec.stop}><span className="record-icon" aria-hidden />{t("Beenden")} · {elapsed}</button>
          ) : (
            <button className="record-button big" onClick={rec.start} disabled={locked || !!missing}>
              <span className="record-icon" aria-hidden />{rec.phase === "saving" ? t("Speichern …") : t("Aufnahme starten")}
            </button>
          )}
          {missing && rec.phase === "idle" && <span className="hint">{t(MISSING[missing])}</span>}
        </div>
        {rec.error && <p className="error">{rec.error}</p>}
        {rec.result && (
          <div className="recording-result">
            <p className="hint">{t("Letzte Aufnahme: {time}", { time: formatTime(rec.result.seconds) })}</p>
            <ul>
              {rec.result.files.map((f) => (
                <li key={f}>
                  <span>{fileName(f)}</span>
                  <button onClick={() => api.revealPath(f)}>{t("Im Ordner zeigen")}</button>
                </li>
              ))}
            </ul>
            {rec.result.errors.map((e) => <p key={e} className="error">{e}</p>)}
          </div>
        )}
        <div className="recording-folder">
          <span className="hint">{t("Ordner")}</span>
          <code>{info?.folder ?? "…"}</code>
          <button onClick={chooseFolder} disabled={locked}>{t("Ordner wählen …")}</button>
          {info && <button onClick={() => api.revealPath(info.folder)}>{t("Öffnen")}</button>}
        </div>
      </section>

      <section className="card">
        <h2>{t("Ziele")}</h2>
        <p className="hint">{t("Mehrere Ziele gleichzeitig möglich.")}</p>
        <div className="recording-options">
          {AUDIO_FORMATS.map((f) => (
            <label key={f.id}>
              <input type="checkbox" checked={r.formats.includes(f.id)} disabled={locked} onChange={(e) => toggleFormat(f.id, e.target.checked)} />
              <span>{f.name}</span>
            </label>
          ))}
          <label>
            <input type="checkbox" checked={r.gp} disabled={locked} onChange={(e) => set({ gp: e.target.checked })} />
            <span>Guitar Pro</span>
          </label>
          <label>
            <input type="checkbox" checked={r.midi} disabled={locked} onChange={(e) => set({ midi: e.target.checked })} />
            <span>{t("MIDI-Ausgang")}</span>
          </label>
        </div>
      </section>

      {r.formats.length > 0 && (
        <section className="card">
          <h2>{t("Audiodateien")}</h2>
          <div className="recording-options">
            <label title={t("Das Signal direkt vom Instrument, ohne Effekte – gut zum Weiterbearbeiten.")}>
              <input type="checkbox" checked={r.dry} disabled={locked} onChange={(e) => set({ dry: e.target.checked })} />
              <span>{t("Trocken")}</span>
            </label>
            <label title={t("So, wie du es beim Mithören hörst: mit Effekten und Plugins.")}>
              <input type="checkbox" checked={r.wet} disabled={locked} onChange={(e) => set({ wet: e.target.checked })} />
              <span>{t("Mit Effekten")}</span>
            </label>
            {(r.formats.includes("mp3") || r.formats.includes("ogg")) && (
              <label>
                <span>{t("Bitrate (MP3, Ogg)")}</span>
                <select value={r.kbps} disabled={locked} onChange={(e) => set({ kbps: Number(e.target.value) })}>
                  {BITRATES.map((b) => <option key={b} value={b}>{b} kbps</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="hint">{t("Beides gewählt: je Format zwei Dateien. WAV und FLAC mit 24 Bit.")}</p>
        </section>
      )}

      {r.gp && (
        <section className="card">
          <h2>Guitar Pro</h2>
          <div className="recording-options">
            <label title={t("Das Metronom läuft während der Aufnahme; die Töne werden auf seine Schläge gerundet.")}>
              <input type="checkbox" checked={r.gpMetronome} disabled={locked} onChange={(e) => set({ gpMetronome: e.target.checked })} />
              <span>{t("Am Metronom ausrichten")}</span>
            </label>
            <label title={t("Ohne Metronom gespielt: das Tempo wird aus den Anschlägen geschätzt.")}>
              <input type="checkbox" checked={r.gpFree} disabled={locked} onChange={(e) => set({ gpFree: e.target.checked })} />
              <span>{t("Tempo schätzen")}</span>
            </label>
          </div>
          <div className="recording-options">
            {r.gpMetronome && (
              <>
                <label>
                  <span>{t("Tempo")}</span>
                  <input type="number" min={30} max={240} value={r.bpm} disabled={locked}
                         onChange={(e) => set({ bpm: Math.min(240, Math.max(30, Number(e.target.value) || 30)) })} />
                  <span>BPM</span>
                </label>
                <label>
                  <span>{t("Metronom-Lautstärke")}</span>
                  <input type="range" min={-40} max={0} step={1} value={r.volumeDb} disabled={locked}
                         onChange={(e) => set({ volumeDb: Number(e.target.value) })} />
                  <span>{r.volumeDb} dB</span>
                </label>
              </>
            )}
            <label>
              <span>{t("Taktart")}</span>
              <select value={r.beatsPerBar} disabled={locked} onChange={(e) => set({ beatsPerBar: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}/4</option>)}
              </select>
            </label>
            <label>
              <span>{t("Raster")}</span>
              <select value={r.steps} disabled={locked} onChange={(e) => set({ steps: Number(e.target.value) === 2 ? 2 : 4 })}>
                <option value={2}>{t("Achtel")}</option>
                <option value={4}>{t("Sechzehntel")}</option>
              </select>
            </label>
          </div>
          <p className="hint">
            {t("Aus den erkannten Tönen (einstimmig) mit Griffstellen, Notenlängen, Pausen und Hammer-ons. Beides gewählt: zwei Dateien. Am Metronom beginnt Takt 1 mit dem betonten Schlag vor deinem ersten Ton – du kannst also einen Takt einzählen lassen.")}
          </p>
        </section>
      )}

      {r.midi && (
        <section className="card">
          <h2>{t("MIDI-Ausgang")}</h2>
          <div className="recording-options">
            <label>
              <span>{t("Gerät")}</span>
              <select value={r.midiId} disabled={locked} onChange={(e) => set({ midiId: e.target.value })}>
                <option value="">{outputs.length ? "–" : t("Kein MIDI-Ausgang gefunden")}</option>
                {outputs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label>
              <span>{t("Kanal")}</span>
              <select value={r.midiChannel} disabled={locked} onChange={(e) => set({ midiChannel: Number(e.target.value) })}>
                {Array.from({ length: 16 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button onClick={() => void api.getRecordingInfo().then(setInfo)} disabled={locked}>{t("Neu suchen")}</button>
          </div>
          <p className="hint">
            {t("Jeder erkannte Ton geht sofort als MIDI-Note an das Gerät, die Anschlagsstärke folgt der Lautstärke. Einstimmig; durch die Tonerkennung kommen die Noten etwas verzögert an (bei tiefen Basstönen spürbar). Für eine DAW auf demselben Rechner braucht es einen virtuellen MIDI-Port, z. B. loopMIDI.")}
          </p>
        </section>
      )}
    </div>
  );
}
