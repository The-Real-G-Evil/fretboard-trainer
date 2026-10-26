import { api } from "../api";
import { t } from "../i18n";

const SUPPORT_URL = "https://buymeacoffee.com/german_evil";

/** Einstellungen → Unterstützen: Hinweis auf Buy Me a Coffee; der Link öffnet im Standardbrowser. */
export function SupportPage() {
  return (
    <section className="card">
      <h2>{t("Fretboard Trainer unterstützen")}</h2>
      <p>
        {t("Der Fretboard Trainer ist kostenlos und quelloffen. Wenn dir die App beim Üben hilft, kannst du die Weiterentwicklung mit einem Kaffee unterstützen – danke!")}
      </p>
      <p>
        <button className="primary" onClick={() => api.openSupportPage()}>☕ {t("Einen Kaffee spendieren")}</button>
      </p>
      <p className="hint">{t("Öffnet {url} im Browser.", { url: SUPPORT_URL })}</p>
    </section>
  );
}
