import { useEffect, useId, useState, type ReactNode } from "react";
import { api, type DeviceConfig, type DeviceInfo } from "../api";

function Select({ label, value, onChange, disabled, children }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

export function DeviceSettings() {
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getAudioDevices().then(setInfo);
  }, []);

  if (!info) return <p className="hint">Geräte werden gesucht …</p>;

  const cur = info.current;
  const type = info.types.find((t) => t.name === cur.type);

  const apply = async (patch: Partial<DeviceConfig>) => {
    setBusy(true);
    try {
      // Bei einem Typwechsel nur den Typ senden: der Kern waehlt dessen Standardgeraete
      const cfg = "type" in patch && patch.type !== cur.type ? patch : { ...cur, ...patch };
      setInfo(await api.setAudioDevice(cfg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fields">
      <Select label="Treiber" value={cur.type} disabled={busy} onChange={(v) => apply({ type: v })}>
        {info.types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
      </Select>

      <Select label={type?.separateInputsAndOutputs ? "Eingangsgerät" : "Gerät"} value={cur.inputDevice} disabled={busy}
              onChange={(v) => apply(type?.separateInputsAndOutputs ? { inputDevice: v } : { inputDevice: v, outputDevice: v })}>
        {!cur.inputDevice && <option value="">–</option>}
        {type?.inputs.map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>

      {type?.separateInputsAndOutputs && (
        <Select label="Ausgangsgerät" value={cur.outputDevice} disabled={busy} onChange={(v) => apply({ outputDevice: v })}>
          {!cur.outputDevice && <option value="">–</option>}
          {type.outputs.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      )}

      <Select label="Eingangskanal" value={cur.inputChannel} disabled={busy || info.inputChannels.length === 0}
              onChange={(v) => apply({ inputChannel: Number(v) })}>
        {info.inputChannels.map((name, i) => <option key={i} value={i}>{i + 1}: {name}</option>)}
      </Select>

      <Select label="Abtastrate" value={cur.sampleRate} disabled={busy} onChange={(v) => apply({ sampleRate: Number(v) })}>
        {info.sampleRates.map((r) => <option key={r} value={r}>{r} Hz</option>)}
      </Select>

      <Select label="Puffergröße" value={cur.bufferSize} disabled={busy} onChange={(v) => apply({ bufferSize: Number(v) })}>
        {info.bufferSizes.map((b) => (
          <option key={b} value={b}>{b} Samples ({((b * 1000) / (cur.sampleRate || 48000)).toFixed(1)} ms)</option>
        ))}
      </Select>

      {info.latencyMs !== undefined && (
        <p className="hint">Geschätzte Round-Trip-Latenz: {info.latencyMs.toFixed(1)} ms</p>
      )}
      {info.error && <p className="error">{info.error}</p>}
    </div>
  );
}
