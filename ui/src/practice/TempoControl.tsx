import { clampTempo, TEMPO_MAX, TEMPO_MIN } from "../song/songPractice";

interface TempoControlProps {
  percent: number;
  onChange: (percent: number) => void;
  bpm?: number | null; // Liedtempo bei 100 % (zur Anzeige in BPM)
  label?: string;
}

/** Tempo in Prozent vom Liedtempo: Schieber und −/+ in 5er-Schritten. */
export function TempoControl({ percent, onChange, bpm, label = "Tempo" }: TempoControlProps) {
  const set = (p: number) => {
    const next = clampTempo(p);
    if (next !== percent) onChange(next);
  };
  return (
    <span className="tempo-control" title="Wiedergabetempo, bezogen auf das Tempo im Lied">
      <span>{label}</span>
      <button onClick={() => set(percent - 5)} disabled={percent <= TEMPO_MIN} aria-label="langsamer">−</button>
      <input type="range" min={TEMPO_MIN} max={TEMPO_MAX} step={5} value={percent} aria-label={label}
             onChange={(e) => set(Number(e.target.value))} />
      <button onClick={() => set(percent + 5)} disabled={percent >= TEMPO_MAX} aria-label="schneller">+</button>
      <span className="tempo-value">{percent} %{bpm ? ` · ${Math.round((bpm * percent) / 100)} BPM` : ""}</span>
    </span>
  );
}
