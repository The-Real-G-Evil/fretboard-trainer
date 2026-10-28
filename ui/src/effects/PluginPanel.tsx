import { useEffect, useState } from "react";
import { api, type PluginState } from "../api";
import { t, tCore } from "../i18n";

/** VST3-Plugins (z. B. Guitar Rig) nach den eigenen Effekten: suchen, einsetzen, Reihenfolge,
    an/aus, Oberfläche öffnen. */
export function PluginPanel() {
  const [state, setState] = useState<PluginState | null>(null);
  const [scan, setScan] = useState<{ progress: number; current: string } | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPlugins().then(setState);
    return api.onPluginScan((e) => {
      if (e.done) {
        setScan(null);
        setState(e);
      } else {
        setScan({ progress: e.progress, current: e.current });
      }
    });
  }, []);

  const apply = async (call: Promise<PluginState>) => {
    setError(null);
    const r = await call;
    if (r.error) setError(tCore(r.error));
    else setState(r);
  };
  const add = async () => {
    if (!choice) return;
    setBusy(true);
    await apply(api.addPlugin(choice));
    setBusy(false);
  };

  if (!state) return null;
  const scanning = state.scanning || scan !== null;

  return (
    <section className="card wide-card plugin-panel">
      <h2>VST3-Plugins</h2>
      <p className="hint">
        {t("Plugins wie Guitar Rig laufen nach den eigenen Effekten, ebenfalls nur im Mithören. Ihre Einstellungen nimmst du in der Oberfläche des Plugins vor; sie werden gespeichert und beim nächsten Start wiederhergestellt.")}
      </p>

      <div className="plugin-add">
        {state.scanned && (
          <>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
              <option value="">{t("Plugin wählen …")}</option>
              {state.available.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` (${p.vendor})` : ""}</option>
              ))}
            </select>
            <button className="primary" onClick={add} disabled={!choice || busy}>{busy ? t("Wird geladen …") : t("Einsetzen")}</button>
          </>
        )}
        <button onClick={() => apply(api.scanPlugins())} disabled={scanning}
                title={t("Durchsucht die üblichen VST3-Ordner des Systems")}>
          {state.scanned ? t("Erneut suchen") : t("Plugins suchen")}
        </button>
        {scanning && (
          <span className="hint">
            {t("Suche läuft")}{scan ? ` – ${Math.round(scan.progress * 100)} %${scan.current ? `: ${scan.current}` : ""}` : " …"}
          </span>
        )}
        {state.scanned && !scanning && <span className="hint">{t("{n} Effekt-Plugins gefunden", { n: state.available.length })}</span>}
      </div>
      {error && <p className="bad">{error}</p>}

      {state.rack.length > 0 ? (
        <ol className="plugin-rack">
          {state.rack.map((p, i) => (
            <li key={`${i}-${p.name}`} className={p.enabled ? "on" : ""}>
              <button className={`fx-switch ${p.enabled ? "on" : ""}`} aria-pressed={p.enabled}
                      onClick={() => apply(api.setPluginEnabled(i, !p.enabled))} title={p.enabled ? t("Ausschalten") : t("Einschalten")}>
                <span className="fx-led" />{p.name}
              </button>
              <span className="hint">{p.vendor}{p.latencyMs >= 0.05 ? " · " + t("{ms} ms Latenz", { ms: p.latencyMs.toFixed(1) }) : ""}</span>
              <span className="plugin-actions">
                <button onClick={() => apply(api.openPluginEditor(i))}>{p.hasEditor ? t("Oberfläche") : t("Regler")}</button>
                <button onClick={() => apply(api.movePlugin(i, -1))} disabled={i === 0} aria-label={t("nach vorn")}>▲</button>
                <button onClick={() => apply(api.movePlugin(i, 1))} disabled={i === state.rack.length - 1} aria-label={t("nach hinten")}>▼</button>
                <button onClick={() => apply(api.removePlugin(i))} title={t("Aus der Kette entfernen")}>{t("Entfernen")}</button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">{t("Noch keine Plugins in der Kette.")}</p>
      )}
      {state.latencyMs >= 0.05 && (
        <p className="hint">
          {t("Zusätzliche Verzögerung beim Mithören durch Plugins: {ms} ms. Die Bewertung ist davon nicht betroffen (sie misst den unbearbeiteten Eingang).", { ms: state.latencyMs.toFixed(1) })}
        </p>
      )}
    </section>
  );
}
