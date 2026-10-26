import { useEffect, useState } from "react";
import { api, type SoundFontInfo } from "../api";
import { t, tCore } from "../i18n";

/** Klang der Liedwiedergabe (Song-Modus): eingebauter Soundfont oder eine eigene SF2-Datei. */
export function SoundFontSettings() {
  const [info, setInfo] = useState<SoundFontInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSoundFont().then(setInfo);
  }, []);

  const choose = async () => {
    setBusy(true);
    setError(null);
    const r = await api.chooseSoundFont();
    setBusy(false);
    if (!r) return; // abgebrochen
    if ("error" in r && r.error) setError(tCore(r.error));
    else setInfo(r as SoundFontInfo);
  };

  return (
    <div className="soundfont-settings">
      <p>
        {t("Aktuell:")} <strong>{info?.name ?? "…"}</strong>
        {info && !info.builtin && <span className="hint"> · {info.path}</span>}
      </p>
      <div className="song-row">
        <button onClick={choose} disabled={busy}>{busy ? t("Soundfont wird geladen …") : t("Soundfont wählen …")}</button>
        {info && !info.builtin && <button onClick={() => api.resetSoundFont().then(setInfo)}>{t("Eingebauten verwenden")}</button>}
        {error && <span className="bad">{error}</span>}
      </div>
      <p className="hint">
        {t("Der eingebaute Soundfont (Sonivox, 1,3 MB) ist klein und klingt entsprechend einfach. Besser klingen freie General-MIDI-Soundfonts im Format .sf2 (nicht .sf3), zum Beispiel GeneralUser GS (ca. 30 MB), FluidR3_GM (ca. 140 MB) oder MuseScore_General (ca. 200 MB). Größere Dateien brauchen beim Laden einige Sekunden und etwa doppelt so viel Arbeitsspeicher. Die Wahl gilt sofort, auch während ein Lied läuft, und bleibt gespeichert.")}
      </p>
    </div>
  );
}
