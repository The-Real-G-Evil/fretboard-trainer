import { useEffect, useId, useState, type ReactNode } from "react";
import asioLogo from "../assets/asio-compatible-white.svg";
import { api, type DeviceConfig, type DeviceInfo } from "../api";
import { t, tCore } from "../i18n";
import { deviceLabel } from "./deviceName";

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
  const [watch, setWatch] = useState(true);

  useEffect(() => {
    api.getAudioDevices().then(setInfo);
    api.getDeviceNotice().then((n) => setWatch(n.watch));
    // Ein-/Ausstecken, Gerät gewechselt: Liste und Auswahl neu lesen
    return api.onAudioDevice(() => void api.getAudioDevices().then(setInfo));
  }, []);

  // Taktausgleich: Anzeige der gemessenen Abweichung aktuell halten
  useEffect(() => {
    if (!info?.splitInput) return;
    const id = window.setInterval(() => void api.getAudioDevices().then(setInfo), 2000);
    return () => window.clearInterval(id);
  }, [info?.splitInput]);

  if (!info) return <p className="hint">{t("Geräte werden gesucht …")}</p>;

  const cur = info.current;
  const type = info.types.find((t) => t.name === cur.type);

  const apply = async (patch: Partial<DeviceConfig>) => {
    setBusy(true);
    try {
      // Bei einem Typwechsel nur den Typ senden: der Kern waehlt dessen Standardgeraete
      // Anderer Eingang: Kanal nicht mitschicken, dann nimmt der Kern den für dieses Gerät gemerkten
      const { inputChannel, ...rest } = cur;
      const base = patch.inputDevice !== undefined && patch.inputDevice !== cur.inputDevice ? rest : { ...rest, inputChannel };
      const cfg = "type" in patch && patch.type !== cur.type ? patch : { ...base, ...patch };
      setInfo(await api.setAudioDevice(cfg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fields">
      <Select label={t("Treiber")} value={cur.type} disabled={busy} onChange={(v) => apply({ type: v })}>
        {info.types.map((ty) => <option key={ty.name} value={ty.name}>{ty.name}</option>)}
      </Select>
      {info.types.some((ty) => ty.name === "ASIO") && (
        // Steinberg-Richtlinien: Logo überall, wo ASIO eingestellt wird, mit Markenhinweis
        <div className="asio-note">
          <img src={asioLogo} alt="ASIO Compatible" />
          <span className="hint">ASIO is a registered trademark of Steinberg Media Technologies GmbH.</span>
        </div>
      )}

      <Select label={type?.separateInputsAndOutputs ? t("Eingangsgerät") : t("Gerät")} value={cur.inputDevice} disabled={busy}
              onChange={(v) => apply(type?.separateInputsAndOutputs ? { inputDevice: v } : { inputDevice: v, outputDevice: v })}>
        {!cur.inputDevice && <option value="">–</option>}
        {type?.inputs.map((d) => <option key={d} value={d}>{deviceLabel(d)}</option>)}
      </Select>

      {type?.separateInputsAndOutputs && (
        <Select label={t("Ausgangsgerät")} value={cur.outputDevice} disabled={busy} onChange={(v) => apply({ outputDevice: v })}>
          {!cur.outputDevice && <option value="">–</option>}
          {type.outputs.map((d) => <option key={d} value={d}>{deviceLabel(d)}</option>)}
        </Select>
      )}

      <Select label={t("Eingangskanal")} value={cur.inputChannel} disabled={busy || info.inputChannels.length === 0}
              onChange={(v) => apply({ inputChannel: Number(v) })}>
        {info.inputChannels.map((name, i) => <option key={i} value={i}>{i + 1}: {name}</option>)}
      </Select>

      <Select label={t("Abtastrate")} value={cur.sampleRate} disabled={busy} onChange={(v) => apply({ sampleRate: Number(v) })}>
        {info.sampleRates.map((r) => <option key={r} value={r}>{r} Hz</option>)}
      </Select>

      <Select label={t("Puffergröße")} value={cur.bufferSize} disabled={busy} onChange={(v) => apply({ bufferSize: Number(v) })}>
        {info.bufferSizes.map((b) => (
          <option key={b} value={b}>{b} Samples ({((b * 1000) / (cur.sampleRate || 48000)).toFixed(1)} ms)</option>
        ))}
      </Select>

      {info.latencyMs !== undefined && (
        <p className="hint">{t("Geschätzte Round-Trip-Latenz: {ms} ms", { ms: info.latencyMs.toFixed(1) })}</p>
      )}
      {info.splitInput && info.drift && (
        <p className="hint" title={t("Ein- und Ausgang laufen mit eigener Uhr; die App gleicht den Unterschied aus, damit beim Mithören nichts knackt.")}>
          {t("Taktausgleich aktiv: {ppm} ppm", { ppm: (info.drift.ppm >= 0 ? "+" : "") + info.drift.ppm.toFixed(0) })}
          {info.drift.underruns > 0 && <> · {t("{n} Aussetzer", { n: info.drift.underruns })}</>}
        </p>
      )}
      <div className="field toggle">
        <label htmlFor="devices-watch">{t("Audiogeräte erkennen")}</label>
        <input id="devices-watch" type="checkbox" role="switch" checked={watch}
               onChange={(e) => {
                 setWatch(e.target.checked);
                 api.setUiSetting("devices.watch", e.target.checked);
               }} />
        <span className="hint">
          {t("Beim Einstecken eines Audiogeräts fragen, ob es der Eingang sein soll; beim Abziehen auf ein anderes ausweichen und später zurückwechseln.")}
        </span>
      </div>
      {info.error && <p className="error">{tCore(info.error)}</p>}
    </div>
  );
}
