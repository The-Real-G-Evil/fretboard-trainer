import { useEffect, useState } from "react";
import { api, type AudioDeviceEvent } from "../api";
import { t } from "../i18n";
import { deviceLabel } from "./deviceName";

type Notice =
  | { kind: "detected"; device: string }
  | { kind: "switched"; device: string; firstUse: boolean }
  | { kind: "lost"; device: string; fallback?: string }
  | { kind: "restored"; device: string }
  | { kind: "channel"; device: string; from: number; to: number };

/** Hinweise zu Audiogeräten oben auf jeder Seite: neues Gerät eingesteckt (als Eingang verwenden?), Gerät gewählt,
    Eingang abgezogen bzw. wieder da. Abschaltbar unter Einstellungen → Audio & Erkennung. */
export function DeviceBanner({ onOpenCalibration }: { onOpenCalibration: () => void }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Erkennung kann vor dem Laden der Oberfläche passiert sein
    api.getDeviceNotice().then((s) => {
      if (s.pending) setNotice({ kind: "detected", device: deviceLabel(s.pending) });
    });
    return api.onAudioDevice((ev: AudioDeviceEvent) => {
      // Namen ohne die Nummer, die Windows beim Wiedereinstecken hochzählt
      const e = { ...ev, device: deviceLabel(ev.device), fallback: ev.fallback && deviceLabel(ev.fallback) };
      switch (e.state) {
        case "deviceDetected": setNotice({ kind: "detected", device: e.device }); break;
        case "deviceGone": setNotice((n) => (n?.kind === "detected" ? null : n)); break;
        case "switched": setNotice({ kind: "switched", device: e.device, firstUse: !!e.firstUse }); break;
        case "inputLost": setNotice({ kind: "lost", device: e.device, fallback: e.fallback }); break;
        case "inputRestored": setNotice({ kind: "restored", device: e.device }); break;
        case "channelSwitched": setNotice({ kind: "channel", device: e.device, from: (e.from ?? 0) + 1, to: (e.to ?? 0) + 1 }); break;
      }
    });
  }, []);

  // Reine Info-Meldungen verschwinden von selbst
  useEffect(() => {
    if (notice?.kind !== "restored" && !(notice?.kind === "switched" && !notice.firstUse)) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (!notice) return null;

  const use = async () => {
    setBusy(true);
    try {
      await api.useNewDevice();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card wide-card update-banner" role="status">
      {notice.kind === "detected" && (
        <>
          <span>{t("Neues Audiogerät erkannt: „{device}“ – als Eingang verwenden?", { device: notice.device })}</span>
          <span className="update-actions">
            <button className="primary" disabled={busy} onClick={() => void use()}>{t("Verwenden")}</button>
            <button disabled={busy} onClick={() => { void api.dismissNewDevice(); setNotice(null); }}>{t("Nein")}</button>
          </span>
        </>
      )}
      {notice.kind === "switched" && (
        <>
          <span>
            {t("Eingang ist jetzt „{device}“.", { device: notice.device })}
            {notice.firstUse && <> {t("Prüfe den Pegel und kalibriere die Erkennung für dieses Gerät.")}</>}
          </span>
          <span className="update-actions">
            {notice.firstUse && (
              <button className="primary" onClick={() => { onOpenCalibration(); setNotice(null); }}>{t("Zur Kalibrierung")}</button>
            )}
            <button onClick={() => setNotice(null)}>{t("OK")}</button>
          </span>
        </>
      )}
      {notice.kind === "lost" && (
        <>
          <span>
            {notice.fallback
              ? t("Eingang „{device}“ getrennt – weiter mit „{fallback}“. Beim Wiedereinstecken wechselt die App zurück.",
                  { device: notice.device, fallback: notice.fallback })
              : t("Eingang „{device}“ getrennt. Beim Wiedereinstecken wechselt die App zurück.", { device: notice.device })}
          </span>
          <span className="update-actions"><button onClick={() => setNotice(null)}>{t("OK")}</button></span>
        </>
      )}
      {notice.kind === "channel" && (
        <>
          <span>
            {t("Kanal {from} von „{device}“ liefert nur Rauschen – die App verwendet jetzt Kanal {to}. Unter Einstellungen → Audio & Erkennung kannst du den Kanal selbst wählen.",
               { from: notice.from, device: notice.device, to: notice.to })}
          </span>
          <span className="update-actions"><button onClick={() => setNotice(null)}>{t("OK")}</button></span>
        </>
      )}
      {notice.kind === "restored" && (
        <span>{t("„{device}“ ist wieder verbunden und wird als Eingang verwendet.", { device: notice.device })}</span>
      )}
    </section>
  );
}
