import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Testkonfiguration getrennt vom Build; Plugins (React, alphaTab) kommen aus vite.config.ts.
// Komponententests wählen ihre Umgebung selbst: `// @vitest-environment happy-dom` am Dateianfang.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      // Ratchet: Ausgangswerte vom 2026-11-28 (abgerundet); dürfen nur steigen
      thresholds: { lines: 47, functions: 34, branches: 34, statements: 46 },
    },
  },
}));
