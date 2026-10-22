import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { alphaTab } from "@coderline/alphatab-vite";

export default defineConfig({
  // alphaTab: Worker für Synthesizer, Schrift (Bravura) und Soundfont in den Build
  plugins: [react(), alphaTab()],
  // Relative Pfade: der Build wird ueber den Resource-Provider der WebView ausgeliefert
  base: "./",
  server: { port: 5173, strictPort: true },
  // Worker als ES-Module: alphaTab bestimmt seine Skriptadresse über import.meta.url
  worker: { format: "es" },
  // alphaTab (GP-Import 1,2 MB, Synthesizer-Worker 2,3 MB) wird erst bei Bedarf nachgeladen
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2500 },
});
