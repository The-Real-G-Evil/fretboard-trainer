import { useEffect, useState } from "react";
import { api, type AudioDeviceEvent } from "../api";
import { t } from "../i18n";

type Notice =
  | { kind: "detected"; device: string }
  | { kind: "switched"; device: string; firstUse: boolean }
  | { kind: "lost"; device: string; fallback?: string }
  | { kind: "restored"; device: string };

/** Hinweise zu Audiogeräten oben auf jeder Seite: Rocksmith-Kabel erkannt (verwenden?), Kabel gewählt,
    Eingang abgezogen bzw. wieder da. */
export function CableBanner({ onOpenCalibration }: { onOpenCalibration: () => void }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Erkennung kann vor dem Laden der Oberfläche passiert sein
    api.getCableState().then((s) => {
      if (s.pending) setNotice({ kind: "detected", device: s.pending });
    });
    return api.onAudioDevice((e: AudioDeviceEvent) => {
      switch (e.state) {
        case "cableDetected": setNotice({ kind: "detected", device: e.device }); break;
        case "cableGone": setNotice((n) => (n?.kind === "detected" ? null : n)); break;
        case "switched": setNotice({ kind: "switched", device: e.device, firstUse: !!e.firstUse }); break;
        case "inputLost": setNotice({ kind: "lost", device: e.device, fallback: e.fallback }); break;
        case "inputRestored": setNotice({ kind: "restored", device: e.device }); break;
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

  const use = async (always: boolean) => {
    setBusy(true);
    try {
      await api.useCable(always); // Ergebnis kommt zusätzlich als Event „switched“
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card wide-card update-banner cable-banner" role="status">
      {notice.kind === "detected" && (
        <>
          <span>{t("Rocksmith-Kabel erkannt ({device}) – als Eingang verwenden?", { device: notice.device })}</span>
          <span className="update-actions">
            <button className="primary" disabled={busy} onClick={() => void use(false)}>{t("Verwenden")}</button>
            <button disabled={busy} onClick={() => void use(true)}>{t("Immer automatisch")}</button>
            <button disabled={busy} onClick={() => { void api.dismissCable(); setNotice(null); }}>{t("Nein")}</button>
          </span>
        </>
      )}
      {notice.kind === "switched" && (
        <>
          <span>
            {t("Eingang ist jetzt das Rocksmith-Kabel ({device}).", { device: notice.device })}
            {notice.firstUse && <> {t("Prüfe den Pegel und kalibriere die Erkennung für das Kabel.")}</>}
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
      {notice.kind === "restored" && (
        <span>{t("„{device}“ ist wieder verbunden und wird als Eingang verwendet.", { device: notice.device })}</span>
      )}
    </section>
  );
}
