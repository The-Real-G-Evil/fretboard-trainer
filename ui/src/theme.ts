// Erscheinungsbild (Einstellungen → Allgemein): Automatisch folgt dem System, sonst fest Hell oder Dunkel.
// Gilt für Hauptfenster und Einstellungsfenster; styles.css wertet das Attribut data-theme auf <html> aus.

import { useEffect } from "react";
import type { UiSettings } from "./practice/settings";

export type Appearance = "auto" | "light" | "dark";

export const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: "auto", label: "Automatisch" },
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
];

export function appearanceOf(ui: UiSettings | null): Appearance {
  const v = ui?.appearance;
  return v === "light" || v === "dark" ? v : "auto";
}

/** Setzt data-theme auf <html>; bei „Automatisch“ auch bei späteren Wechseln des Systems. */
export function useAppearance(appearance: Appearance) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = appearance === "auto" ? (mq.matches ? "dark" : "light") : appearance;
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("ft.theme", theme); // beim nächsten Start sofort richtig (vor dem Laden der Einstellungen)
      } catch { /* ohne Speicher eben erst nach dem Laden */ }
    };
    apply();
    if (appearance !== "auto") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [appearance]);
}
