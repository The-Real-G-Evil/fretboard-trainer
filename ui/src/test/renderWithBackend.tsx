// Rendert eine Komponente gegen das Vorschau-Backend (mockBackend.ts, ohne JUCE) in fester Sprache.
// Nur in Testdateien mit `// @vitest-environment happy-dom` verwenden.
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { api } from "../api";
import { setLang, type Lang } from "../i18n";

export async function renderWithBackend(ui: ReactElement, { lang = "de" }: { lang?: Lang } = {}): Promise<RenderResult> {
  // Gespeicherte Sprache im Mock-Backend setzen und die Systemsprache passend vorgeben
  vi.spyOn(navigator, "language", "get").mockReturnValue(lang === "de" ? "de-DE" : "en-GB");
  await api.setUiSetting("language", lang);
  setLang(lang);
  return render(ui);
}
