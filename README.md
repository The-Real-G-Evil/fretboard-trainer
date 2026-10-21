# Fretboard Trainer

Desktop-Anwendung zum Trainieren des Notenlesens auf Saiteninstrumenten. Das Instrument wird über ein Audio-Interface angeschlossen; die App zeigt Noten an, erkennt den gespielten Ton und bewertet ihn.

Die vollständige Spezifikation steht in [SPEC.md](SPEC.md).

**Stand:** Phase 2 – Tonerkennung (YIN-Tonhöhe, Anschlagserkennung, Hammer-on/Pull-off, Stimmgerät) auf Basis von Phase 1 (Geräteauswahl, Mithören, Noisegate, Pegelanzeige).

## Aufbau

```
CMakeLists.txt
cmake/        Hilfsskripte (UI-Build einbetten)
src/app/      JUCEApplication, MainWindow, WebView + Bridge, Einstellungen
src/audio/    AudioEngine, NoiseGate, LevelMeter, Analyse (PitchDetector, OnsetDetector,
              NoteTracker, Analyzer, AnalysisWorker)
tests/        Catch2-Tests, Testsignal-Synthese, WAV-Ein-/Ausgabe
tests/data/   Test-WAVs mit erwarteten Noten (siehe tests/data/README.md)
tools/        ft_wavtool: Test-WAVs erzeugen, Aufnahmen analysieren
ui/           Vite + React + TypeScript
```

## Tonerkennung

- **Tonhöhe:** YIN mit FFT-Kreuzkorrelation. Das Analysefenster richtet sich nach dem tiefsten
  Ton (Einstellungen → Tonerkennung): 55 Hz → 2048 Samples (43 ms bei 48 kHz),
  28 Hz (tiefes H des Basses) → 4096 Samples (85 ms).
- **Anschlag:** spektraler Fluss + Hüllkurve, Zeitpunkt auf ~1 ms genau. Ein Tonwechsel ohne
  Anschlag wird als `legato` (Hammer-on/Pull-off) gemeldet.
- **Latenz** vom Anschlag bis zur Note (synthetische Signale, 48 kHz): Gitarre ~55 ms,
  Legato ~30 ms, Bass bis tiefes H ~100 ms.
- Analysiert wird in einem eigenen Thread; der Audio-Thread reicht das Signal nur lock-frei weiter.

```bash
build/tests/Release/ft_wavtool analyze aufnahme.wav 55 1500
```

## Voraussetzungen

- CMake ≥ 3.24
- Node.js ≥ 20 mit npm (für die Oberfläche)
- Git (CMake lädt JUCE 8 und Catch2 per `FetchContent`)

### Windows

- Visual Studio 2022 mit Workload „Desktopentwicklung mit C++“ (inkl. Windows-SDK)
- WebView2 wird statisch gelinkt; die WebView2-Runtime ist in Windows 10/11 enthalten.

```bash
cd ui && npm install && cd ..
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
ctest --test-dir build -C Release
```

Die App liegt danach unter `build/FretboardTrainer_artefacts/Release/Fretboard Trainer.exe`.

### Linux (Debian/Ubuntu)

```bash
sudo apt install build-essential cmake git nodejs npm pkg-config \
  libasound2-dev libjack-jackd2-dev libwebkit2gtk-4.1-dev libgtk-3-dev \
  libcurl4-openssl-dev libfreetype-dev libfontconfig1-dev
cd ui && npm install && cd ..
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build
```

## Dev- und Release-Modus der Oberfläche

- **Release** (Standard): CMake ruft `npm run build` in `ui/` auf und bettet das Ergebnis (`ui/dist`) als Binärdaten in die App ein. Ausgeliefert wird es über den Resource-Provider von `WebBrowserComponent`.
- **Dev:** `-DFT_UI_DEV_SERVER=ON` – die App lädt `http://localhost:5173`. Vorher in `ui/` `npm run dev` starten; Änderungen an der UI erscheinen dann sofort (Hot Reload).

## CMake-Optionen

| Option | Standard | Bedeutung |
|---|---|---|
| `FT_UI_DEV_SERVER` | `OFF` | UI vom Vite-Dev-Server laden statt eingebettet |
| `FT_BUILD_TESTS` | `ON` | Catch2-Tests bauen |
| `FT_ENABLE_ASIO` | `OFF` | ASIO-Unterstützung (nur Windows) |
| `FT_ASIO_SDK_DIR` | – | Pfad zum entpackten Steinberg-ASIO-SDK |

Ohne ASIO nutzt die App unter Windows WASAPI/DirectSound, unter Linux ALSA bzw. JACK (auch über PipeWire-JACK).

### ASIO

Das ASIO-SDK ist nicht im Repository enthalten und muss separat bei Steinberg heruntergeladen werden:

```bash
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DFT_ENABLE_ASIO=ON -DFT_ASIO_SDK_DIR="C:/SDKs/asiosdk"
```

**Lizenz beachten:** Steinberg bietet das ASIO-SDK inzwischen neben der proprietären Lizenz auch unter GPLv3 an; GPLv3 ist mit AGPLv3 kombinierbar. Vor einer Veröffentlichung von Binärdateien mit ASIO bitte die Lizenzbedingungen der verwendeten SDK-Version prüfen. Ohne `FT_ENABLE_ASIO` wird kein ASIO-Code gebaut.

## Einstellungen

Gerät, Gain, Mithören und Gate werden beim Beenden bzw. bei jeder Änderung gespeichert:

- Windows: `%APPDATA%\FretboardTrainer\settings.xml`
- Linux: `~/.config/FretboardTrainer/settings.xml`

## Lizenz

AGPLv3 – siehe [LICENSE](LICENSE). Verwendet JUCE 8 (AGPLv3) und später alphaTab (MPL-2.0).
