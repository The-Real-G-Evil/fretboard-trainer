// Gemeinsame Testvorbereitung für alle Testdateien (Node- und DOM-Umgebung).
import { afterEach, vi } from "vitest";

// Tests dürfen nie ins Netz (z. B. die Update-Prüfung gegen GitHub): fetch schlägt immer fehl.
vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Netzzugriff in Tests nicht erlaubt"))));

// DOM-Tests: gerenderte Komponenten nach jedem Test abräumen (ohne Vitest-Globals nötig)
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
