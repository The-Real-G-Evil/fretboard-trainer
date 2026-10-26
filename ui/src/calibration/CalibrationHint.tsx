import { useEffect, useState } from "react";
import { api, type CalibrationState } from "../api";
import type { Instrument } from "../instruments";
import { load, save } from "../storage";
import { exercisesFor } from "./exercises";
import { recommendations } from "./recommendations";
import { t } from "../i18n";

const SNOOZE_DAYS = 3;

/** Gelegentlicher Hinweis außerhalb der Einstellungen: zeigt die wichtigste Kalibrier-
    Empfehlung und lässt sich für einige Tage ausblenden. */
export function CalibrationHint({ instrument, onOpen }: { instrument: Instrument; onOpen: () => void }) {
  const [state, setState] = useState<CalibrationState | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(() => Number(load("calibration.snoozedUntil") ?? 0));

  useEffect(() => {
    api.getCalibration().then(setState);
    return api.onCalibrationUpdated(() => api.getCalibration().then(setState));
  }, []);

  if (!state || Date.now() < snoozedUntil) return null;

  const recs = recommendations(exercisesFor(instrument), state.takes, instrument.id, load(`calibration.lastOptimizedAt.${instrument.id}`));
  if (recs.length === 0) return null;

  // Wichtigste zuerst: misslungene Aufnahmen, dann die nächste Stufe
  const order = ["retake", "measureNoise", "nextLevel", "optimize", "stale"];
  const top = [...recs].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];

  const snooze = () => {
    const until = Date.now() + SNOOZE_DAYS * 86_400_000;
    setSnoozedUntil(until);
    save("calibration.snoozedUntil", String(until));
  };

  return (
    <div className="calib-hint" role="status">
      <span className="calib-hint-label">{t("Kalibrierung")}</span>
      <span>{top.text}{recs.length > 1 && " " + t("(+{n} weitere)", { n: recs.length - 1 })}</span>
      <button className="primary" onClick={onOpen}>{t("Öffnen")}</button>
      <button onClick={snooze}>{t("Später")}</button>
    </div>
  );
}
