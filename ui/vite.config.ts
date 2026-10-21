import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative Pfade: der Build wird ueber den Resource-Provider der WebView ausgeliefert
  base: "./",
  server: { port: 5173, strictPort: true },
  // alphaTab (GP-Import, ca. 1,2 MB) wird erst beim Öffnen eines Lieds nachgeladen
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
