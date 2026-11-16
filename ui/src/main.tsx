import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SettingsApp } from "./settings/SettingsApp";
import { PLATFORM, VIEW } from "./sharedSettings";
import "./styles.css";

// Einstellungsfenster: Look des Systems (styles.css, Abschnitt „Einstellungsfenster“)
if (VIEW === "settings") document.documentElement.classList.add("sys", `sys-${PLATFORM}`);
// Erscheinungsbild des letzten Starts gleich anwenden (kein Aufblitzen); theme.ts korrigiert nach dem Laden
try {
  const theme = localStorage.getItem("ft.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch { /* egal */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {VIEW === "settings" ? <SettingsApp /> : <App />}
  </StrictMode>,
);
