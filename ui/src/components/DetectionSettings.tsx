import type { DetectionConfig } from "../api";
import type { Instrument } from "../instruments";
import { Slider } from "./Slider";
import { t } from "../i18n";

interface DetectionSettingsProps {
  config: DetectionConfig;
  instrument: Instrument;
  onChange: (c: DetectionConfig) => void;
}

/** Tonbereich der Erkennung für das gewählte Instrument. Anpassen ändert nur dessen Profil,
    das Instrument bleibt gewählt. */
export function DetectionSettings({ config, instrument, onChange }: DetectionSettingsProps) {
  const isDefault = config.minHz === instrument.minHz && config.maxHz === instrument.maxHz;
  const frameMs = Math.round((1000 * Math.max(1024, 2 ** Math.ceil(Math.log2((2 * 48000) / config.minHz)))) / 48000);

  return (
    <>
      <Slider label={t("Tiefster Ton")} value={config.minHz} min={20} max={300} step={1} unit="Hz" decimals={0}
              onChange={(minHz) => onChange({ ...config, minHz, maxHz: Math.max(config.maxHz, minHz * 2) })} />
      <Slider label={t("Höchster Ton")} value={config.maxHz} min={200} max={4000} step={10} unit="Hz" decimals={0}
              onChange={(maxHz) => onChange({ ...config, maxHz: Math.max(maxHz, config.minHz * 2) })} />
      <div className="range-default">
        {isDefault ? (
          <span className="hint">{t("Standardbereich für {name} ({min}–{max} Hz)", { name: instrument.name, min: instrument.minHz, max: instrument.maxHz })}</span>
        ) : (
          <>
            <span className="hint">{t("Angepasst für {name} (Standard {min}–{max} Hz)", { name: instrument.name, min: instrument.minHz, max: instrument.maxHz })}</span>
            <button onClick={() => onChange({ ...config, minHz: instrument.minHz, maxHz: instrument.maxHz })}>
              {t("Auf Standard zurücksetzen")}
            </button>
          </>
        )}
      </div>
      <Slider label={t("Toleranz")} value={config.centsTolerance} min={5} max={50} step={1} unit="Cent" decimals={0}
              onChange={(centsTolerance) => onChange({ ...config, centsTolerance })} />
      <p className="hint">
        {t("Ein tieferer tiefster Ton braucht ein längeres Analysefenster und erhöht die Latenz ({ms} ms bei 48 kHz). Tonbereich und kalibrierte Erkennungsparameter werden je Instrument gespeichert; die Toleranz gilt für alle.", { ms: frameMs })}
      </p>
    </>
  );
}
