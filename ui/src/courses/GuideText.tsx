import type { ExerciseGuide } from "./modules";
import { t } from "../i18n";

/** Anleitung einer Kursübung: Ziel, worauf man achten soll, Tipp. */
export function GuideText({ guide }: { guide: ExerciseGuide }) {
  return (
    <div className="guide-text">
      {guide.goal && <p><strong>{t("Ziel")}:</strong> {guide.goal}</p>}
      {guide.focus.length > 0 && (
        <>
          <strong>{t("Darauf achten")}:</strong>
          <ul>{guide.focus.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </>
      )}
      {guide.tip && <p className="guide-tip"><strong>{t("Tipp")}:</strong> {guide.tip}</p>}
    </div>
  );
}
