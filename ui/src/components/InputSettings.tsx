import { useId } from "react";
import { Slider } from "./Slider";

interface InputSettingsProps {
  inputGainDb: number;
  monitoring: { on: boolean; volumeDb: number };
  onInputGainChange: (db: number) => void;
  onMonitoringChange: (m: { on: boolean; volumeDb: number }) => void;
}

export function InputSettings({ inputGainDb, monitoring, onInputGainChange, onMonitoringChange }: InputSettingsProps) {
  const toggleId = useId();
  return (
    <div className="fields">
      <Slider label="Eingangsverstärkung" value={inputGainDb} min={-24} max={36} step={0.5} unit="dB"
              onChange={onInputGainChange} />

      <div className="field toggle">
        <label htmlFor={toggleId}>Mithören</label>
        <input
          id={toggleId}
          type="checkbox"
          role="switch"
          checked={monitoring.on}
          onChange={(e) => onMonitoringChange({ ...monitoring, on: e.target.checked })}
        />
        <span className="hint">{monitoring.on ? "an" : "aus"}</span>
      </div>

      <Slider label="Lautstärke" value={monitoring.volumeDb} min={-60} max={6} step={0.5} unit="dB"
              onChange={(volumeDb) => onMonitoringChange({ ...monitoring, volumeDb })} />
    </div>
  );
}
