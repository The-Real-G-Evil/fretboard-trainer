# Baut den Installer: Anleitung (HTML) erzeugen, dann Inno Setup aufrufen.
# Voraussetzungen: Release-Build in build\ (cmake --build build --config Release), Python mit "markdown",
# Inno Setup 6 (ISCC.exe im PATH, unter %LOCALAPPDATA%\Programs\Inno Setup 6 oder Program Files).
# Ergebnis: build\installer\FretboardTrainer-<Version>-Setup.exe

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Version aus CMakeLists.txt (FT_VERSION_LABEL)
$match = Select-String -Path (Join-Path $root "CMakeLists.txt") -Pattern 'set\(FT_VERSION_LABEL "([0-9.]+)"\)'
if (-not $match) { throw "FT_VERSION_LABEL nicht in CMakeLists.txt gefunden" }
$version = $match.Matches[0].Groups[1].Value

$exe = Join-Path $root "build\FretboardTrainer_artefacts\Release\Fretboard Trainer.exe"
if (-not (Test-Path $exe)) { throw "Release-Build fehlt: $exe" }

$out = Join-Path $root "build\installer"
New-Item -ItemType Directory -Force $out | Out-Null
$docs = Join-Path $out "Anleitung.html"
python (Join-Path $PSScriptRoot "build_docs.py") $docs
if ($LASTEXITCODE -ne 0) { throw "Anleitung konnte nicht erzeugt werden" }

$iscc = @(
    (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source,
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 (ISCC.exe) nicht gefunden" }

& $iscc "/DAppVersion=$version" "/DSourceDir=$root" "/DDocsFile=$docs" "/DOutputDir=$out" (Join-Path $PSScriptRoot "FretboardTrainer.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup ist fehlgeschlagen" }
Write-Host "Installer: $(Join-Path $out "FretboardTrainer-$version-Setup.exe")"
