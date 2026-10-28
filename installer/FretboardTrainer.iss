; Installer fuer den Fretboard Trainer (Inno Setup 6).
; Bauen: installer\build_installer.ps1 (baut Anleitung und ruft ISCC mit den richtigen Pfaden auf).
;
; Installiert ohne Administratorrechte fuer den aktuellen Benutzer (%LOCALAPPDATA%\Programs).
; Einstellungen, Statistik und Aufnahmen (%APPDATA%\FretboardTrainer) bleiben bei der Deinstallation erhalten.

#ifndef AppVersion
  #define AppVersion "00.00.04"
#endif
#ifndef SourceDir
  #define SourceDir ".."
#endif
#ifndef DocsFile
  #define DocsFile SourceDir + "\build\installer\Anleitung.html"
#endif
#ifndef OutputDir
  #define OutputDir SourceDir + "\build\installer"
#endif

#define AppName "Fretboard Trainer"
#define AppExe "Fretboard Trainer.exe"

[Setup]
; Fest: identifiziert die App bei Updates und Deinstallation
AppId={{3D482899-08A3-435B-A94C-B333E5FB7553}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppName}
VersionInfoVersion=0.0.4.0
VersionInfoTextVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
LicenseFile={#SourceDir}\LICENSE
OutputDir={#OutputDir}
OutputBaseFilename=FretboardTrainer-{#AppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
SetupIconFile={#SourceDir}\resources\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
de.Manual=Anleitung
en.Manual=Manual (German)
de.OpenManual=Anleitung öffnen
en.OpenManual=Open the manual (German)
de.WebView2Missing=Die Microsoft Edge WebView2 Runtime wurde nicht gefunden. Der Fretboard Trainer braucht sie für seine Oberfläche.
en.WebView2Missing=The Microsoft Edge WebView2 Runtime was not found. Fretboard Trainer needs it for its user interface.
de.WebView2Download=Jetzt die Download-Seite von Microsoft öffnen?
en.WebView2Download=Open Microsoft's download page now?

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\build\FretboardTrainer_artefacts\Release\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DocsFile}"; DestDir: "{app}"; DestName: "Anleitung.html"; Flags: ignoreversion
Source: "{#SourceDir}\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "{#SourceDir}\MODULE.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{cm:Manual}"; Filename: "{app}\Anleitung.html"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\Anleitung.html"; Description: "{cm:OpenManual}"; Flags: shellexec nowait postinstall skipifsilent unchecked

[Code]
// Die Oberflaeche laeuft in Microsoft Edge WebView2. Unter Windows 11 ist die Laufzeit vorhanden,
// unter Windows 10 meist ueber Edge; fehlt sie, auf den Download hinweisen.
const
  WebView2Key = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function WebView2Installed(): Boolean;
var
  Version: String;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM, WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKCU, WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ErrorCode: Integer;
begin
  if (CurStep = ssPostInstall) and not WebView2Installed() then
    if MsgBox(CustomMessage('WebView2Missing') + #13#10#13#10 + CustomMessage('WebView2Download'), mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://developer.microsoft.com/microsoft-edge/webview2/', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;
