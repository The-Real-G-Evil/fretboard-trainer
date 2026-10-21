import { useId } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals?: number;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, unit, decimals = 1, onChange }: SliderProps) {
  const id = useId();
  return (
    <div className="field slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>
        {value.toFixed(decimals)} {unit}
      </output>
    </div>
  );
}
