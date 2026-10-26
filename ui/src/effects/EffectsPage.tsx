import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { UiSettings } from "../practice/settings";
import { PluginPanel } from "./PluginPanel";
import {
  DEFAULT_EFFECTS, PRESETS, sameEffects, saveUserPresets, UNITS, userPresets, type EffectParams, type EffectUnit,
} from "./effects";
import { t } from "../i18n";

interface EffectsPageProps {
  ui: UiSettings;
  onUiChange: (ui: UiSettings) => void;
  monitoring: { on: boolean; volumeDb: number };
  onMonitoringChange: (m: { on: boolean; volumeDb: number }) => void;
}

/** Effektkette des Mithörens: Presets, je Effekt An/Aus und Regler. Änderungen wirken sofort. */
export function EffectsPage({ ui, onUiChange, monitoring, onMonitoringChange }: EffectsPageProps) {
  const [fx, setFx] = useState<EffectParams | null>(null);
  const [name, setName] = useState("");
  const pending = useRef<number | undefined>(undefined);

  useEffect(() => {
    api.getEffects().then((p) => setFx({ ...DEFAULT_EFFECTS, ...p }));
    return () => window.clearTimeout(pending.current);
  }, []);

  if (!fx) return <section className="card wide-card"><p className="hint">{t("Effekte werden geladen …")}</p></section>;

  const own = userPresets(ui);
  const apply = (next: EffectParams, immediate = false) => {
    setFx(next);
    // Regler: höchstens alle 30 ms an den Kern (Schieber erzeugen viele Ereignisse)
    window.clearTimeout(pending.current);
    if (immediate) void api.setEffects(next);
    else pending.current = window.setTimeout(() => void api.setEffects(next), 30);
  };
  const current = PRESETS.find((p) => sameEffects(p.params, fx))?.name
    ?? Object.entries(own).find(([, p]) => sameEffects(p, fx))?.[0] ?? "";

  const savePreset = () => {
    const n = name.trim();
    if (!n) return;
    onUiChange(saveUserPresets(ui, { ...own, [n]: fx }));
    setName("");
  };
  const deletePreset = (n: string) => {
    const { [n]: _, ...rest } = own;
    onUiChange(saveUserPresets(ui, rest));
  };

  return (
    <>
      <section className="card wide-card fx-head">
        <label>
          <span>Preset</span>
          <select value={current} onChange={(e) => {
            const p = PRESETS.find((x) => x.name === e.target.value)?.params ?? own[e.target.value];
            if (p) apply(p, true);
          }}>
            {current === "" && <option value="">{t("(eigene Einstellung)")}</option>}
            <optgroup label={t("Eingebaut")}>
              {PRESETS.map((p) => <option key={p.name} value={p.name}>{t(p.name)}</option>)}
            </optgroup>
            {Object.keys(own).length > 0 && (
              <optgroup label={t("Eigene")}>
                {Object.keys(own).sort().map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        {own[current] && <button onClick={() => deletePreset(current)}>{t("Preset löschen")}</button>}
        <span className="fx-save">
          <input type="text" placeholder={t("Name für eigenes Preset")} value={name} maxLength={40}
                 onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} />
          <button onClick={savePreset} disabled={!name.trim()}>{t("Speichern")}</button>
        </span>
        <button onClick={() => apply(DEFAULT_EFFECTS, true)}>{t("Alle aus")}</button>
        <p className="hint fx-note">
          {t("Die Effekte wirken nur auf das Mithören – die Tonerkennung bekommt weiterhin das unbearbeitete Signal.")}
          {!monitoring.on && (
            <> {t("Mithören ist aus:")} <button className="link-button" onClick={() => onMonitoringChange({ ...monitoring, on: true })}>{t("einschalten")}</button></>
          )}
        </p>
      </section>

      <div className="fx-chain">
        {UNITS.map((u) => <Unit key={u.id} unit={u} fx={fx} onChange={apply} />)}
      </div>

      <PluginPanel />
    </>
  );
}

function Unit({ unit, fx, onChange }: { unit: EffectUnit; fx: EffectParams; onChange: (p: EffectParams, immediate?: boolean) => void }) {
  const on = fx[unit.on];
  return (
    <section className={`card fx-unit ${on ? "on" : ""}`}>
      <header>
        <button className={`fx-switch ${on ? "on" : ""}`} aria-pressed={on} title={on ? t("Ausschalten") : t("Einschalten")}
                onClick={() => onChange({ ...fx, [unit.on]: !on }, true)}>
          <span className="fx-led" />{t(unit.name)}
        </button>
      </header>
      <p className="hint">{t(unit.hint)}</p>
      {unit.knobs.map((k) => (
        <label key={k.key} className="fx-knob">
          <span>{t(k.label)}</span>
          <input type="range" min={k.min} max={k.max} step={k.step} value={fx[k.key]}
                 onChange={(e) => onChange({ ...fx, [k.key]: Number(e.target.value) })} />
          <span className="fx-value">{k.format(fx[k.key])}</span>
        </label>
      ))}
    </section>
  );
}
