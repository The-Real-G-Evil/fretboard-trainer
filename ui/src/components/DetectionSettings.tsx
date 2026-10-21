import type { DetectionConfig } from "../api";
import { Slider } from "./Slider";

// Tonumfang typischer Instrumente (tiefste Leersaite bis hohe Lagen, mit etwas Reserve)
const PRESETS: { label: string; minHz: number; maxHz: number }[] = [
  { label: "Gitarre (6/7)", minHz: 55, maxHz: 1500 },
  { label: "Gitarre (8)", minHz: 40, maxHz: 1500 },
  { label: "Bass (4/5/6)", minHz: 28, maxHz: 800 },
  { label: "Ukulele", minHz: 180, maxHz: 1500 },
  { label: "Violine", minHz: 180, maxHz: 3000 },
  { label: "Viola", minHz: 120, maxHz: 2000 },
  { label: "Cello", minHz: 60, maxHz: 1200 },
];

interface DetectionSettingsProps {
  config: DetectionConfig;
  onChange: (c: DetectionConfig) => void;
}

export function DetectionSettings({ config, onChange }: DetectionSettingsProps) {
  const active = PRESETS.find((p) => p.minHz === config.minHz && p.maxHz === config.maxHz);

  return (
    <div className="fields">
      <div className="presets" role="group" aria-label="Tonumfang-Vorlagen">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={p === active ? "active" : ""}
            onClick={() => onChange({ ...config, minHz: p.minHz, maxHz: p.maxHz })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Slider label="Tiefster Ton" value={config.minHz} min={25} max={300} step={1} unit="Hz" decimals={0}
              onChange={(minHz) => onChange({ ...config, minHz, maxHz: Math.max(config.maxHz, minHz * 2) })} />
      <Slider label="Höchster Ton" value={config.maxHz} min={200} max={4000} step={10} unit="Hz" decimals={0}
              onChange={(maxHz) => onChange({ ...config, maxHz: Math.max(maxHz, config.minHz * 2) })} />
      <Slider label="Toleranz" value={config.centsTolerance} min={5} max={50} step={1} unit="Cent" decimals={0}
              onChange={(centsTolerance) => onChange({ ...config, centsTolerance })} />
      <p className="hint">
        Ein tieferer tiefster Ton braucht ein längeres Analysefenster und erhöht die Latenz
        ({Math.round((1000 * 2 ** Math.ceil(Math.log2((2 * 48000) / config.minHz))) / 48000)} ms bei 48 kHz).
      </p>
    </div>
  );
}
