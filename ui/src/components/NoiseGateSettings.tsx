import type { NoiseGateParams } from "../api";
import { Slider } from "./Slider";
import { t } from "../i18n";

interface NoiseGateSettingsProps {
  params: NoiseGateParams;
  onChange: (p: NoiseGateParams) => void;
}

export function NoiseGateSettings({ params, onChange }: NoiseGateSettingsProps) {
  const set = (key: keyof NoiseGateParams) => (value: number) => onChange({ ...params, [key]: value });

  return (
    <div className="fields">
      <Slider label={t("Schwelle")} value={params.thresholdDb} min={-90} max={0} step={0.5} unit="dBFS"
              onChange={set("thresholdDb")} />
      <Slider label={t("Hysterese")} value={params.hysteresisDb} min={0} max={20} step={0.5} unit="dB"
              onChange={set("hysteresisDb")} />
      <Slider label="Attack" value={params.attackMs} min={0} max={50} step={0.1} unit="ms"
              onChange={set("attackMs")} />
      <Slider label="Hold" value={params.holdMs} min={0} max={500} step={1} unit="ms" decimals={0}
              onChange={set("holdMs")} />
      <Slider label="Release" value={params.releaseMs} min={1} max={1000} step={1} unit="ms" decimals={0}
              onChange={set("releaseMs")} />
    </div>
  );
}
