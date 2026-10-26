# Testprotokoll Fretboard Trainer

Stand: Version **00.00.03** (Phasen 1–9). Getestet wird die mit dem Installer installierte App.

## So wird das Protokoll benutzt

- Reihenfolge einhalten: Die Bereiche bauen aufeinander auf (Audio → Erkennung → Üben → Lieder → Auswertung).
- Je Testfall ankreuzen: **OK**, **Fehler** oder **n. g.** (nicht getestet). Bei Fehler kurz notieren, *was* passiert
  ist und *was* erwartet war; Screenshot hilft.
- **Priorität:** A = Grundfunktion, ohne sie ist die App nicht benutzbar · B = wichtig · C = Feinschliff.
- **📼 Diagnose:** Bei so markierten Fällen vor dem Start *Diagnose-Aufnahme* einschalten. Die Aufnahme liegt danach
  unter `Dokumente/Fretboard Trainer/Diagnose/` (.wav + .json). Mit diesen Daten werden Schwellen der Erkennung
  abgestimmt – bitte den Dateinamen im Feld *Notiz* eintragen.
- Bei Fehlern, die die Erkennung betreffen (falscher Ton, Ton nicht erkannt, doppelt erkannt): wenn möglich mit
  Diagnose-Aufnahme wiederholen.

**Testumgebung** (einmal ausfüllen)

| | |
|---|---|
| Datum | |
| App-Version (oben rechts in der App) | |
| Windows-Version | |
| Audio-Interface / Treiber | |
| Puffergröße / Abtastrate | |
| Instrument(e) und Stimmung | |
| Soundfont | |

---

## 0. Installation

### T-0.1 Installieren (A)
1. `FretboardTrainer-00.00.03-Setup.exe` starten (SmartScreen-Hinweis: *Weitere Informationen* → *Trotzdem ausführen*).
2. Assistent durchlaufen, Desktop-Verknüpfung anhaken, am Ende *Fretboard Trainer starten*.

Erwartet: Installation ohne Administratorrechte; Startmenü-Einträge *Fretboard Trainer* und *Anleitung*; App startet,
oben rechts steht **v00.00.03**.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-0.2 Anleitung (B)
1. Startmenü → *Fretboard Trainer* → *Anleitung*.

Erwartet: Anleitung öffnet sich im Browser, Inhaltsverzeichnis-Links springen an die richtigen Stellen; Beschreibungen
passen zur App (Beschriftungen, Abläufe).

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-0.3 Vorhandene Daten (B)
1. Falls schon eine Entwicklerversion benutzt wurde: Einstellungen, Statistik und Kalibrierung nach der Installation prüfen.

Erwartet: Einstellungen und Statistik aus `%APPDATA%\FretboardTrainer` werden weiterverwendet.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 1. Audio und Grundlagen

### T-1.1 Gerät und Mithören (A)
1. *Einstellungen → Audio & Erkennung*: Gerät, Eingang, Ausgang wählen.
2. Instrument spielen, Mithören an/aus, Lautstärke ändern.

Erwartet: Instrument ist ohne hörbare Verzögerung zu hören; Pegelanzeige reagiert; Einstellungen bleiben nach Neustart erhalten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.2 Noisegate (B)
1. Nicht spielen, Gate-Schwelle so einstellen, dass das Grundrauschen geschlossen ist.
2. Leise und laut spielen.

Erwartet: Gate öffnet bei jedem Anschlag, schließt in der Pause; kein Flattern.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.3 Stimmgerät (A)
1. Seite *Stimmgerät*, jede Saite einzeln anschlagen, dann eine Saite bewusst verstimmen.

Erwartet: richtiger Ton mit Oktave; Cent-Anzeige ruhig und plausibel; Verstimmung wird angezeigt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.4 Kalibrierung (B)
1. Hinweis *Kalibrierung* öffnen, Grundrauschen messen.
2. Mindestens eine Übung aufnehmen, danach *Optimieren*.

Erwartet: Aufnahmen werden bewertet; Optimierung läuft durch und zeigt das Ergebnis; neue Werte gelten sofort.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 2. Üben mit Zufallsnoten

### T-2.1 Warte-Modus, Stufe Sehr leicht (A)
1. Stufe *Sehr leicht*, Quelle *Zufall*, Spielmodus *Nach Stufe*, *Start*.
2. 20 Noten spielen, dazwischen absichtlich 3 falsche Töne und 1 falsche Oktave.

Erwartet: Griffstelle mit Finger auf dem Griffbrett; nächste Note erst nach dem richtigen Ton; falsche Töne als Fehler, falsche Oktave mit Hinweis.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.2 Getaktet, Stufe Mittel (A)
1. Stufe *Mittel*, Tempo *Mittel*, 70 BPM, *Start*.
2. Eine Minute auf den Schlag spielen, einmal deutlich zu früh, einmal eine Note auslassen.

Erwartet: Vorzähler; Zeitleiste läuft; Treffer mit Abweichung in ms; *zu früh* und *verpasst* werden erkannt; Tendenz plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.3 Timing-Ausgleich (B)
1. Wie T-2.2. Werden alle Treffer gleich als „zu spät“ gewertet, Timing-Ausgleich anpassen.

Erwartet: Nach dem Ausgleich liegen genaue Anschläge bei ±20 ms.

- [ ] OK  [ ] Fehler  [ ] n. g. — Wert: ____ ms — Notiz:

### T-2.3a Timing messen (B)
1. *Einstellungen → Kalibrierung → Timing messen*, 80 BPM, *Messung starten*.
2. Saiten abdämpfen, nach dem Vorzähler 16 Schläge auf den Klick anschlagen.
3. Vorschlag übernehmen, danach T-2.2 wiederholen.

Erwartet: Vorzähler und Schlagzähler laufen; jeder Anschlag erscheint als Balken; am Ende Mittelwert, Streuung und
mindestens 14 von 16 erkannten Schlägen; nach dem Übernehmen steht der Wert beim Üben unter *Timing-Ausgleich* und
genaue Anschläge liegen bei ±20 ms.

- [ ] OK  [ ] Fehler  [ ] n. g. — Wert: ____ ms, Streuung ____ ms — Notiz:

### T-2.4 Vorzeichen, Stufe Schwer (B)
1. Stufe *Schwer*, getaktet. Töne mit ♯ und ♭ spielen.

Erwartet: Vorzeichen im System richtig; enharmonische Schreibweise (z. B. G♯/A♭) wird beide Male als richtig erkannt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.5 Stufe Hammer-ons und Pull-offs 📼 (A)
1. Diagnose-Aufnahme an. Stufe *Hammer-ons und Pull-offs*, Warte-Modus.
2. Gebundene Noten (H/P-Bogen) gebunden spielen; zweimal absichtlich anschlagen statt binden.

Erwartet: gebunden gespielte Noten zählen voll; angeschlagen statt gebunden: Treffer mit Hinweis und halben Punkten; keine Doppel-Erkennung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-2.6 Lautstärke bewerten (C)
1. *Lautstärke bewerten* an, Fenster ±6 dB, Warte-Modus, 30 Noten gleichmäßig, dann einige deutlich lauter/leiser.

Erwartet: Abweichungen werden angezeigt; außerhalb des Fensters ¾ der Punkte; *automatisch enger* verkleinert das Fenster nach einem guten Durchgang.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.7 Adaptiv (C)
1. Mehrere Durchgänge mit *Adaptiv*; einen Ton absichtlich oft falsch spielen.

Erwartet: dieser Ton kommt in späteren Durchgängen spürbar öfter.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 3. Tonleiter-Trainer

### T-3.1 Auswahl und Anzeige (A)
1. Quelle *Tonleiter*, Grundton A, *Moll-Pentatonik*, Umfang 1 Oktave.
2. Danach F-Dur und D-Dur wählen.

Erwartet: Tonnamen richtig (A C D E G; F-Dur mit B; D-Dur mit F♯ und C♯); Griffbrett zeigt alle Leitertöne im Übungsbereich, Grundton hervorgehoben.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-3.2 Auf und ab, Griffstellen (A)
1. *Auf und ab*, Wiederholen an, Übungsbereich z. B. Bund 5–8, Warte-Modus *Sehr leicht*.

Erwartet: Tonfolge aufwärts und wieder abwärts, Grundton beim Wiederholen nicht doppelt; Griffstellen in einer Lage ohne unnötige Sprünge.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-3.3 Zufällige Reihenfolge, getaktet (B)
1. Reihenfolge *zufällig*, Spielmodus *Getaktet*.

Erwartet: nur Leitertöne, Schreibweise passend zur Tonart; Statistik zeigt den Durchgang als „Tonleiter …“.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 4. Lieder (Guitar Pro) ohne Notenlängen

### T-4.1 Laden und Spurwahl (A)
1. *Lied öffnen …* mit einer .gp5/.gpx-Datei; Spur wechseln; App neu starten.

Erwartet: Lied wird geladen; passende Spur zum Instrument vorgeschlagen; zuletzt geöffneter Ordner und Liste „zuletzt geöffnet“ bleiben nach Neustart.

- [ ] OK  [ ] Fehler  [ ] n. g. — Datei: — Notiz:

### T-4.2 Tonfolge mit Akkorden, Warte-Modus 📼 (A)
1. Diagnose-Aufnahme an. Lied mit Akkorden, Spielmodus *Getaktet*, Stufe *Mittel*.
2. Akkorde vollständig spielen; einmal einen Akkordton auslassen; einmal geschlagen (Strumming) spielen.

Erwartet: Akkord als Notenstapel mit Akkordsymbol und Griff; vollständig = Treffer; ein fehlender Ton bei *Mittel* noch Treffer mit „x von y Tönen“; zwei fehlende = „Akkord unvollständig – es fehlt …“; Strumming zählt als ein Anschlag.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-4.3 Problemstellen (C)
1. Mehrere Durchgänge mit einem Lied; danach die vorgeschlagenen Problemstellen anklicken.

Erwartet: schwache Takte werden genannt; Klick setzt den Taktbereich mit Takt davor/danach.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 5. Song-Modus (Wiedergabe mit Notenlängen)

### T-5.1 Wiedergabe und Mischpult (A)
1. Spielmodus *Lied mitspielen*, *Start*, *▶ Wiedergabe*.
2. Spuren stumm/solo schalten, Lautstärken ändern, Übungsspur wechseln.

Erwartet: alle Spuren über das Audio-Interface hörbar; Cursor und Autoscroll laufen mit; Mischpult wirkt sofort; Spurwechsel ohne Unterbrechung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.2 Bewertung beim Mitspielen (A)
1. Einen Abschnitt mitspielen, einige Noten bewusst auslassen.

Erwartet: Treffer mit ms-Abweichung, ausgelassene als *Verpasst*; Abweichungen plausibel (sonst Timing-Ausgleich prüfen).

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.3 Bedienung: Stop, Takt vor/zurück, Bereich (B)
1. *Stop*, *◀ Takt*/*Takt ▶* mehrfach, grünen und roten Balken ziehen bzw. per Button setzen, *Ganzes Lied*.

Erwartet: Stop springt an den Bereichsanfang, Knopf zeigt wieder *Wiedergabe*; Takt-Sprünge summieren sich; Bereich wirkt sofort, Ansicht springt nicht.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.4 Tempo während der Wiedergabe (A)
1. Wiedergabe starten, Tempo mit −/+ und Schieber ändern (z. B. 60 % → 85 %).

Erwartet: Lied läuft ohne Unterbrechung im neuen Tempo weiter; BPM-Anzeige stimmt; Bewertung bleibt plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.5 Tempo steigern (A)
1. Bereich von 2–4 Takten, *Wiederholen* endlos, Tempo 60 %, *Tempo steigern* an (+5 %, ab 90 % Treffer, bis 100 %).
2. Mehrere Durchläufe gut spielen, einen absichtlich schlecht.

Erwartet: nach guten Durchläufen +5 % mit Meldung; nach dem schlechten bleibt das Tempo; bei 100 % „Zieltempo erreicht“.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.6 Lied wartet auf dich (A)
1. Spielmodus *Lied wartet auf dich*, auch Stellen mit Akkorden.

Erwartet: Wiedergabe hält an jeder eigenen Note bzw. jedem Akkord, läuft nach dem richtigen Ton/Akkord weiter; Einzeltöne am Akkord lösen nichts aus.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.8 Akkorde beim Mitspielen 📼 (B)
1. Diagnose-Aufnahme an. Lied mit Akkorden, *Lied mitspielen*, Stufe *Mittel*.

Erwartet: vollständig gespielte Akkorde zählen als Treffer, unvollständige werden mit „es fehlt …“ gemeldet; ein
Akkord wird erst nach dem Ergebnis der Akkordprüfung (kurz nach dem Fenster) als verpasst gewertet.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-5.7 Metronom und Soundfont (C)
1. Metronom an/aus, Lautstärke ändern; eigenen Soundfont wählen, App neu starten.

Erwartet: Metronom und Vorzähler in der eingestellten Lautstärke; Soundfont bleibt nach Neustart gewählt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 6. Spielmodus Rhythmus und Kurse

### T-6.1 Rhythmus-Übung erzeugen (A)
1. Stufe *Mittel*, Quelle *Zufall*, Spielmodus *Rhythmus (Notenlängen)*, Rhythmus *einfach*, 8 Takte, 60 BPM, *Start*.
2. *Beenden*, Rhythmus *mittel* und *schwer* je einmal starten.

Erwartet: Noten und Tab mit passenden Notenwerten (einfach: Ganze/Halbe/Viertel; mittel: + Achtel, Pausen; schwer: + Sechzehntel, Punktierungen); jeder Start erzeugt eine neue Übung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.2 Rhythmus spielen 📼 (A)
1. Diagnose-Aufnahme an. Übung *mittel* mit Vorzähler mitspielen.

Erwartet: Bewertung jeder Note im Zeitfenster der Stufe; Pausen werden nicht als verpasst gewertet; Tempo und *Tempo steigern* funktionieren wie im Song-Modus.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-6.3 Rhythmus mit Tonleiter (B)
1. Quelle *Tonleiter* (z. B. A Moll-Pentatonik, auf und ab), Spielmodus *Rhythmus*.

Erwartet: Tonleiter in Reihenfolge mit Rhythmus; Statistik zeigt „Rhythmus“ mit der Tonleiter.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.4 Stufen ohne Ultra (B)
1. Stufenauswahl ansehen; mit Quelle *Lied* die Spielmodus-Liste öffnen.

Erwartet: fünf Stufen, die letzte heißt *Hammer-ons und Pull-offs*; *Rhythmus* wird nur ohne Lied angeboten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.5 Kurse (A)
1. Seite *Kurse* → *Ordner hinzufügen …* → einen Ordner mit Kursen wählen (z. B. `Z:\Bass\Module`).
2. Kurs anklicken, bei einer Übung *Üben*; auf der Übungsseite *Nächste ▶* und *Kursübersicht* benutzen.
3. Eine Übung mit mindestens 90 % abschließen, zurück zur Kursübersicht; App neu starten.

Erwartet: Kurse mit Lektionen und Übungen erscheinen; *Üben* lädt die Übung mit Spielmodus und Tempo aus dem Kurs, oben
steht der Kurs-Kasten; geschaffte Übung hat ein ✓ und die beste Quote; Kursordner und zuletzt geübte Übung bleiben nach
dem Neustart erhalten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.6 Eigenen Kurs erstellen (B)
1. Nach `MODULE.md` einen kleinen Kurs mit einer alphaTex-Übung im Standardordner anlegen, *Neu einlesen*.
2. In der `module.json` absichtlich einen Fehler einbauen (z. B. Datei `../x.tex`).

Erwartet: Kurs erscheint und lässt sich üben; der Fehler wird unter *Hinweise zur module.json* gemeldet, der Rest bleibt nutzbar.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 7. Nachanalyse und Review

### T-7.1 Endwert nach dem Durchgang (A)
1. Einen getakteten Durchgang (1–2 min) spielen, *Beenden*.

Erwartet: „Nachanalyse der Aufnahme läuft …“, danach „Live x % → Endwert y %“ innerhalb weniger Sekunden; Werte plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Live: ___ % Endwert: ___ % — Notiz:

### T-7.2 Schnelle Passage (A)
1. Getaktet, Tempo *Sehr schnell* (Achtel) oder ein schnelles Lied, bis die Live-Erkennung Noten verpasst.

Erwartet: Endwert erkennt mehr gespielte Noten als live (Endwert ≥ Live bei sauberem Spiel).

- [ ] OK  [ ] Fehler  [ ] n. g. — Live: ___ % Endwert: ___ % — Notiz:

### T-7.3 Review ansehen und anhören (A)
1. *Review ansehen*; auf Markierungen und Zeilen klicken; *nur Fehler* aus- und einschalten.

Erwartet: Wellenform mit farbigen Markierungen (grün/gelb/rot/grau) und erkannten Noten darunter; Klick spielt die Stelle über das Audio-Interface ab; *Stopp* beendet die Wiedergabe.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-7.4 Review aus der Statistik (B)
1. *Statistik → Letzte Durchgänge*, auf einen Endwert klicken.

Erwartet: Review des Durchgangs öffnet sich; ältere Durchgänge (ab dem 26.) haben keine Aufnahme mehr.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 8. Statistik und Einstellungen

### T-8.1 Statistik (B)
1. *Statistik* öffnen, Heatmaps, Verwechslungen und Durchgänge ansehen.

Erwartet: Durchgänge aller Modi erscheinen (warten, getaktet, Lied, Rhythmus, Tonleiter) mit Quote, Endwert und Dauer; Heatmap passt zum Gespielten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.2 Einstellungen bleiben erhalten (B)
1. Stufe, Quelle, Tonleiter, Rhythmus-Einstellungen, Song-Tempo, Tempo steigern, Mischpult, Stimmung ändern; App neu starten.

Erwartet: alles ist wie vor dem Neustart.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.3 Stimmung und Instrument (B)
1. Instrument wechseln (Gitarre ↔ Bass), Stimmung z. B. Drop D, ein Lied in anderer Stimmung laden.

Erwartet: Übungsbereich und Erkennung passen sich an; *Stimmung übernehmen* wird angeboten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.4 Sprache (B)
1. Oben rechts *English* wählen, alle Reiter durchsehen; Statistik öffnen; App neu starten; zurück auf *Deutsch*.

Erwartet: alle Texte der App sind englisch (Kursinhalte bleiben, wie sie geschrieben sind); Notennamen zeigen B statt H
und B♭ statt B; nach dem Neustart ist Englisch noch eingestellt; Dateidialoge haben englische Titel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.5 Unterstützen (C)
1. *Einstellungen → Unterstützen* → *Einen Kaffee spendieren*.

Erwartet: buymeacoffee.com/german_evil öffnet sich im Standardbrowser.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 9. Effekte (Phase 9)

### T-9.1 Presets und Klang (A)
1. Mithören an. Seite *Effekte*, nacheinander die Presets *Clean mit Hall*, *Crunch*, *Lead*, *Ambient* (Gitarre)
   bzw. *Bass clean*, *Bass Drive* (Bass) wählen und spielen.

Erwartet: jedes Preset klingt deutlich anders und brauchbar; kein Knacken beim Umschalten; keine hörbare zusätzliche Verzögerung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.2 Einzelne Effekte und Regler (B)
1. *Alle aus*, dann jeden Effekt einzeln einschalten und alle Regler einmal ganz durchfahren.

Erwartet: jeder Regler wirkt hörbar und ohne Knackser; Delay und Hall klingen nach dem Ausschalten natürlich aus; auch Extremwerte (Gain 40 dB, Wiederholungen 95 %) bleiben stabil, kein Pfeifen oder Aussetzen.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.3 Erkennung bleibt trocken (A)
1. Preset *Lead* (starke Verzerrung, Delay, Hall). Stimmgerät und eine Übung (Warte-Modus) spielen.

Erwartet: Erkennung genauso zuverlässig wie ohne Effekte (kein Ton aus Delay-Wiederholungen oder Hallfahne, keine Oktavfehler durch Verzerrung).

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.4 Eigene Presets und Speichern (B)
1. Regler verändern, als eigenes Preset speichern, anderes Preset wählen, eigenes wieder wählen; App neu starten.
2. Eigenes Preset löschen.

Erwartet: eigenes Preset erscheint unter *Eigene* und stellt alle Werte wieder her; nach dem Neustart gelten die zuletzt eingestellten Effekte; Löschen entfernt es.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.6 VST3-Plugins suchen und einsetzen (A)
1. Seite *Effekte* → *VST3-Plugins* → *Plugins suchen*.
2. *Guitar Rig 7* wählen, *Einsetzen*, *Oberfläche* öffnen, ein Preset wählen, spielen.

Erwartet: Suche zeigt Fortschritt und findet Guitar Rig 6/7, Phasis, Replika, Solid Bus Comp, Supercharger (keine
Instrumente wie Kontakt); Guitar Rig öffnet sich in eigenem Fenster und ist im Mithören zu hören; angezeigte Latenz plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.7 Plugin-Kette bedienen (B)
1. Zweites Plugin (z. B. Replika) einsetzen; Reihenfolge mit ▲/▼ tauschen; ein Plugin ausschalten; eines entfernen.

Erwartet: Änderungen sofort hörbar, ohne Aussetzer der Wiedergabe; ausgeschaltetes Plugin wird umgangen.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.8 Plugin-Zustand bleibt erhalten (A)
1. In Guitar Rig ein bestimmtes Preset einstellen, Plugin-Fenster schließen, App beenden und neu starten.
2. Variante: App beenden, während das Plugin-Fenster offen ist.

Erwartet: Kette und Guitar-Rig-Preset sind nach dem Neustart wieder da (beide Varianten).

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.9 Erkennung mit Plugins (A)
1. Guitar Rig mit stark verzerrtem Preset und Delay; eine Übung im getakteten Modus spielen.

Erwartet: Erkennung und Timing-Bewertung wie ohne Plugin.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-9.5 Effekte mit Liedwiedergabe und Metronom (C)
1. Song-Modus mit Effekt-Preset spielen.

Erwartet: nur das eigene Instrument klingt mit Effekt; Lied und Metronom unverändert.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 10. Abschluss

### T-10.1 Beenden und Neustart (A)
1. App mit geladenem Lied, aktiven Effekten und einem Plugin beenden; neu starten.

Erwartet: App schließt zügig (keine Fehlermeldung, kein hängender Prozess im Task-Manager); nach dem Start ist alles
wie zuvor.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-10.2 Deinstallieren (B)
1. *Einstellungen → Apps → Fretboard Trainer → Deinstallieren*.

Erwartet: Programm, Startmenü- und Desktop-Verknüpfung sind entfernt; `%APPDATA%\FretboardTrainer` (Einstellungen,
Statistik, Aufnahmen) bleibt erhalten. Erneut installieren: alles wieder da.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## Zusammenfassung

| Bereich | OK | Fehler | n. g. |
|---|---|---|---|
| 0 Installation | | | |
| 1 Audio und Grundlagen | | | |
| 2 Zufallsnoten | | | |
| 3 Tonleiter | | | |
| 4 Lieder ohne Notenlängen | | | |
| 5 Song-Modus | | | |
| 6 Spielmodus Rhythmus, Kurse | | | |
| 7 Nachanalyse und Review | | | |
| 8 Statistik und Einstellungen | | | |
| 9 Effekte | | | |
| 10 Abschluss | | | |

Diagnose-Aufnahmen: 

Weitere Beobachtungen:
