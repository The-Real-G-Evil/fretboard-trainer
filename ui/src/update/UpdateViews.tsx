import { useState } from "react";
import { t } from "../i18n";
import { checkForUpdate, openDownload, RELEASES_PAGE, useUpdateState } from "./updateCheck";

/** Hinweis oben auf jeder Seite, wenn eine neuere Version vorliegt („Später“ blendet ihn bis zum nächsten Start aus). */
export function UpdateBanner() {
  const { info } = useUpdateState();
  const [hidden, setHidden] = useState(false);
  if (!info?.newer || hidden) return null;
  return (
    <section className="card wide-card update-banner">
      <span>{t("Eine neue Version ist verfügbar: {version}", { version: info.latest })}</span>
      <span className="update-actions">
        <button className="primary" onClick={() => void openDownload(info)}>⬇ {t("Herunterladen")}</button>
        <button onClick={() => setHidden(true)}>{t("Später")}</button>
      </span>
    </section>
  );
}

interface UpdateSettingsProps {
  current: string;
  autoCheck: boolean;
  onAutoCheckChange: (on: boolean) => void;
}

/** Einstellungen → Version & Updates. */
export function UpdateSettings({ current, autoCheck, onAutoCheckChange }: UpdateSettingsProps) {
  const { checking, info, failed, checkedAt } = useUpdateState();
  return (
    <section className="card">
      <h2>{t("Version & Updates")}</h2>
      <p>{t("Installierte Version")}: <strong>{current || "–"}</strong></p>
      <p>
        {t("Neueste Version")}: <strong>{info?.latest ?? "–"}</strong>
        {info && !info.newer && <span className="hint"> · {t("Du bist auf dem neuesten Stand.")}</span>}
      </p>
      {failed && checkedAt && <p className="hint bad">{t("GitHub war nicht erreichbar.")}</p>}
      <p className="update-actions">
        <button onClick={() => void checkForUpdate(current)} disabled={checking}>
          {checking ? t("Prüfe …") : t("Jetzt prüfen")}
        </button>
        {info?.newer && (
          <button className="primary" onClick={() => void openDownload(info)}>⬇ {t("Version {version} herunterladen", { version: info.latest })}</button>
        )}
      </p>
      {info?.newer && (
        <p className="hint">{info.file ? t("Lädt {file} im Browser herunter.", { file: info.file }) : t("Öffnet {url} im Browser.", { url: RELEASES_PAGE })}</p>
      )}
      <div className="fields">
        <div className="field toggle">
          <label htmlFor="update-auto">{t("Beim Start automatisch prüfen")}</label>
          <input id="update-auto" type="checkbox" role="switch" checked={autoCheck}
                 onChange={(e) => onAutoCheckChange(e.target.checked)} />
          <span className="hint">{autoCheck ? t("an") : t("aus")}</span>
        </div>
      </div>
    </section>
  );
}
