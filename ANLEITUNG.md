# Fretboard Trainer – Anleitung

Version 00.00.02

Der Fretboard Trainer hilft dir, das Griffbrett zu lernen und Noten zu lesen. Du spielst auf deinem echten Instrument, die
App hört über dein Audio-Interface zu, erkennt jeden Ton und bewertet Tonhöhe, Oktave und Timing. Geübt wird mit
Zufallsnoten, Tonleitern oder Liedern aus Guitar-Pro-Dateien, wahlweise mit Wiedergabe des Lieds zum Mitspielen.

## Inhalt

1. [Installation](#1-installation)
2. [Erste Schritte](#2-erste-schritte)
3. [Üben](#3-uben)
4. [Tonleitern](#4-tonleitern)
5. [Lieder](#5-lieder)
6. [Song-Modus: mitspielen](#6-song-modus-mitspielen)
7. [Rhythmus](#7-rhythmus)
7a. [Kurse](#7a-kurse)
8. [Nachanalyse und Review](#8-nachanalyse-und-review)
9. [Statistik](#9-statistik)
10. [Effekte und Plugins](#10-effekte-und-plugins)
11. [Stimmgerät und Kalibrierung](#11-stimmgerat-und-kalibrierung)
12. [Tipps und Fehlerbehebung](#12-tipps-und-fehlerbehebung)
13. [Daten, Versionen, Lizenz](#13-daten-versionen-lizenz)

---

## 1. Installation

**Voraussetzungen**

- Windows 10 oder 11, 64 Bit
- Microsoft Edge WebView2 Runtime (bei Windows 11 vorhanden; bei Windows 10 mit Edge in aller Regel auch)
- ein Audio-Interface mit Instrumenteneingang (oder ein anderer Eingang, an dem dein Instrument anliegt)
- Kopfhörer oder Lautsprecher am Ausgang des Interfaces

**Installieren**

1. `FretboardTrainer-00.00.02-Setup.exe` starten.
2. Windows zeigt eventuell „Der Computer wurde durch Windows geschützt“ (das Installationsprogramm ist nicht signiert):
   *Weitere Informationen* → *Trotzdem ausführen*.
3. Dem Assistenten folgen. Die App wird für deinen Benutzer installiert, Administratorrechte sind nicht nötig.
4. Starten über das Startmenü (*Fretboard Trainer*) oder die Verknüpfung auf dem Desktop.

Deinstallieren: *Einstellungen → Apps → Fretboard Trainer → Deinstallieren*. Deine Einstellungen, Statistik und
Aufnahmen bleiben dabei erhalten (siehe [Daten](#13-daten-versionen-lizenz)).

---

## 2. Erste Schritte

### Audio einrichten

*Einstellungen → Audio & Erkennung*:

1. **Treiber und Gerät** wählen. Für die geringste Verzögerung *Windows Audio (Low Latency Mode)* oder *Windows Audio
   (Exclusive Mode)*, *DirectSound* nur, wenn nichts anderes geht.
2. **Eingangskanal**: den Kanal, an dem dein Instrument steckt. **Ausgang**: Kopfhörer bzw. Lautsprecher.
3. **Puffergröße** so klein wie möglich, ohne dass es knackt (typisch 128–256 Samples).
4. **Eingangsverstärkung**: Spiel kräftig – die Pegelanzeige soll deutlich ausschlagen, aber nicht rot werden.
5. **Mithören** einschalten, wenn du dein Instrument über die App hören willst (z. B. mit Effekten). Wenn du es schon
   direkt über das Interface hörst, lass es aus.

### Instrument und Stimmung

Unter *Einstellungen → Audio & Erkennung* das **Instrument** wählen (Gitarre mit 6, 7 oder 8 Saiten, Bass mit 4, 5
oder 6 Saiten, Ukulele, Violine, Viola, Cello). Die **Stimmung** (Standard, Drop D, Es-Stimmung, …) und den **Notenschlüssel** stellst du auf der
Übungsseite unter *Übungsbereich & Stimmung* ein.

### Noisegate

Das Gate schaltet den Eingang stumm, solange du nicht spielst. So meldet die Erkennung kein Rauschen als Ton.
Stell die **Schwelle** knapp über das Grundrauschen: Hände vom Instrument, die Pegelanzeige beobachten, Schwelle etwas
darüber. Die Kalibrierung (siehe [Abschnitt 11](#11-stimmgerat-und-kalibrierung)) misst das auch automatisch.

### Erst einmal stimmen

Seite *Stimmgerät*: Saite anschlagen, Ton und Cent-Abweichung ablesen. Die App erwartet die Töne in der gewählten
Stimmung und mit richtiger Oktave.

---

## 3. Üben

Seite *Üben*. Oben wählst du **Stufe**, **Notenquelle** und **Spielmodus**, dann *Start*.

### Stufen

| Stufe | Hilfen | Töne | Standard-Spielmodus | Zeitfenster |
|---|---|---|---|---|
| Sehr leicht | Notenname, Griffstelle mit Finger auf dem Griffbrett | nur Stammtöne | Warten | ±¼ Schlag |
| Leicht | Notenname, Griffbrett mit allen Tonnamen zum Nachschlagen | nur Stammtöne | Warten | ±¼ Schlag |
| Mittel | keine | nur Stammtöne | Getaktet | ±¼ Schlag |
| Schwer | keine | auch ♯/♭ | Getaktet | ±0,15 Schlag |
| Hammer-ons und Pull-offs | keine | auch ♯/♭, ab und zu gebundene Noten | Getaktet | ±0,1 Schlag |

Die Oktave muss immer stimmen. Je höher die Stufe, desto mehr Punkte gibt es je Treffer (×1 bis ×2,5); dazu kommt eine
Combo für Treffer in Folge.

**Hammer-ons und Pull-offs:** Noten mit Bogen und „H“ bzw. „P“ werden ohne neuen Anschlag gespielt (aufschlagen bzw.
abziehen). Schlägst du sie trotzdem an, zählt der Ton, aber nur mit halben Punkten.

### Notenquellen

- **Zufall** – Töne aus deinem Übungsbereich (Saiten und Bünde unter *Übungsbereich & Stimmung*). Mit *Adaptiv*
  kommen Töne, die dir schwerfallen oder die du länger nicht geübt hast, öfter.
- **Tonleiter** – siehe [Abschnitt 4](#4-tonleitern).
- **Lied** – Töne einer Spur aus einer Guitar-Pro-Datei, siehe [Abschnitt 5](#5-lieder).

### Spielmodi

- **Warten** – die nächste Note erscheint erst, wenn du die aktuelle richtig gespielt hast. Gemessen werden Treffer,
  Fehler und deine Reaktionszeit.
- **Getaktet** – ein Metronom läuft (nach vier Schlägen Vorzähler); jede Note fällt auf einen Schlag. Eine Zeitleiste
  zeigt, wann die nächste dran ist. Treffer werden mit ihrer Abweichung in Millisekunden angezeigt. Tempo-Stufe
  (Ganze, Halbe, Viertel, Achtel) und BPM stellst du ein.
- **Rhythmus (Notenlängen)** – Töne mit echten Notenwerten und Pausen, siehe [Abschnitt 7](#7-rhythmus).
- **Lied mitspielen** / **Lied wartet auf dich** – nur mit einem Lied, siehe [Abschnitt 6](#6-song-modus-mitspielen).

*Nach Stufe* wählt den Modus passend zur Stufe; du kannst ihn jederzeit selbst festlegen.

### Weitere Schalter

- **Timing-Ausgleich** (getaktet, Lied, Rhythmus): Werden deine Treffer durchweg als „zu spät“ (oder „zu früh“)
  gewertet, obwohl du genau spielst, hier ein paar Millisekunden ausgleichen – oder unter *Einstellungen →
  Kalibrierung → Timing messen* automatisch bestimmen lassen.
- **Lautstärke bewerten**: bewertet, wie gleichmäßig laut deine Anschläge sind. Treffer außerhalb des Fensters
  (z. B. ±6 dB) geben weniger Punkte, sind aber kein Fehler. *Automatisch enger* verkleinert das Fenster nach einem
  gleichmäßigen Durchgang.
- **Diagnose-Aufnahme**: speichert den Durchgang mit allen erkannten Tönen unter
  `Dokumente\Fretboard Trainer\Diagnose`. Hilfreich, um Erkennungsfehler zu melden.

---

## 4. Tonleitern

Notenquelle *Tonleiter*:

1. **Grundton** und **Tonleiter** wählen (Dur, Moll natürlich/harmonisch/melodisch, Dur- und Moll-Pentatonik, Blues,
   Dorisch, Phrygisch, Lydisch, Mixolydisch, Lokrisch, chromatisch).
2. **Reihenfolge**: *auf und ab*, *aufwärts*, *abwärts* oder *zufällig*.
3. **Umfang**: 1–3 Oktaven ab dem tiefsten Grundton im Übungsbereich oder *ganzer Bereich*; *Wiederholen* für endlos.

Das Griffbrett zeigt vorab alle Leitertöne im Übungsbereich, den Grundton hervorgehoben. Die App wählt Griffstellen,
die möglichst in einer Lage bleiben. Tipp: Den Übungsbereich auf eine Lage beschränken (z. B. Bund 5–8), dann übst du
genau diesen Fingersatz.

---

## 5. Lieder

Notenquelle *Lied* → *Lied öffnen …* und eine Guitar-Pro-Datei (.gp, .gpx, .gp5, .gp4, .gp3) wählen. Die zuletzt
geöffneten Lieder stehen in einer Liste.

- **Spur**: die App schlägt die passende Spur für dein Instrument vor; du kannst jede Spur wählen.
- **Taktbereich** und **Wiederholen**: nur einen Abschnitt üben, auf Wunsch in Schleife.
- **Stimmung übernehmen**: Ist die Spur für eine andere Stimmung geschrieben, bietet die App diese an.
- **Problemstellen**: Nach einigen Durchgängen nennt die App Takte mit vielen Fehlern; ein Klick übt den Takt mit
  Nachbartakten in Schleife.

Im Spielmodus *Getaktet* übst du die reine Tonfolge des Lieds (ohne Notenlängen); zum Üben im eigenen Tempo gibt es *Lied wartet auf dich* (siehe [Abschnitt 6](#6-song-modus-mitspielen)). Den Spielmodus *Warten* gibt es nur für Zufall und Tonleiter.

**Akkorde** stehen als Notenstapel mit Akkordsymbol (z. B. Am, G7) im System. Die App prüft jeden Akkordton einzeln:
bis *Leicht* genügt die Hälfte der Töne, bei *Mittel* darf einer fehlen, darüber müssen alle klingen. Fehlende Töne
werden genannt. Akkorde dürfen geschlagen werden (Strumming). Oktavverdopplungen (z. B. das hohe E im offenen E-Dur)
lassen sich nicht einzeln prüfen und zählen nicht mit.

---

## 6. Song-Modus: mitspielen

Mit einem Lied gibt es zwei weitere Spielmodi. Das Lied wird mit allen Spuren über dein Audio-Interface abgespielt,
Noten und Tabulatur deiner Spur laufen mit Cursor mit.

- **Lied mitspielen** – nach dem Vorzähler läuft das Lied durch; jede Note wird mit ihrer echten Länge im Zeitfenster
  bewertet.
- **Lied wartet auf dich** – die Wiedergabe hält an jeder Note deiner Spur an, bis du sie gespielt hast.

**Bedienung**

- *▶ Wiedergabe* / *❚❚ Pause*, *■ Stop* (zurück an den Anfang), *◀ Takt* / *Takt ▶* (mehrfach klicken = mehrere Takte).
- **Bereich**: den grünen (Start) und roten (Ende) Balken in den Noten ziehen oder mit *Start setzen* / *Ende setzen*
  und einem Klick in die Noten setzen. *Ganzes Lied* setzt zurück; *Wiederholen* mit Anzahl der Durchläufe.
- **Mischpult** unter den Noten: je Spur Lautstärke, Stumm (M) und Solo (S). Ein Klick auf einen Spurnamen macht sie
  zu deiner Übungsspur, ohne die Wiedergabe zu unterbrechen.
- **Metronom** zuschaltbar, Lautstärke für Metronom und Vorzähler einstellbar.

**Tempo**: 20–150 % des Liedtempos (Schieber oder −/+), auch während das Lied läuft.

**Tempo steigern**: Langsam anfangen und schneller werden. Einschalten, Schritt (+2/+5/+10 %), nötige Trefferquote
(80–100 %) und Zieltempo wählen. Nach jedem Durchlauf mit genug Treffern wird das Tempo erhöht. Am besten zusammen mit
*Wiederholen* auf einem kurzen Bereich.

**Klang**: Die App bringt einen einfachen Soundfont mit. Unter *Einstellungen → Audio & Erkennung → Klang der
Liedwiedergabe* kannst du eine eigene .sf2-Datei wählen (z. B. GeneralUser GS).

---

## 7. Rhythmus

Spielmodus *Rhythmus (Notenlängen)* mit Notenquelle *Zufall* oder *Tonleiter*: Bei jedem Start erzeugt die App eine
neue Übung mit echten Notenwerten und Pausen und spielt sie wie ein Lied ab (Noten, Tabulatur, Cursor, Vorzähler,
Metronom, Tempo und *Tempo steigern* wie im Song-Modus).

- **Rhythmus**: *einfach* (Ganze, Halbe, Viertel), *mittel* (dazu Achtel, punktierte Halbe, Pausen), *schwer* (dazu
  Sechzehntel, punktierte Viertel, Synkopen).
- **Takte**: 4, 8 oder 16. **BPM**: Tempo bei 100 %.
- Deine eigene Stimme klingt leise mit; im Mischpult kannst du sie lauter, leiser oder stumm schalten.

---

## 7a. Kurse

Seite *Kurse*: Übungsreihen (Kurse), die man aus Ordnern lädt – selbst erstellt oder von anderen weitergegeben.

- **Kursordner**: Der Standardordner ist `Dokumente\Fretboard Trainer\Module`; mit *Ordner hinzufügen …* kommen
  weitere dazu (z. B. ein Ordner mit eigenen Kursen). *Öffnen* zeigt den Ordner im Explorer, *Neu einlesen* sucht
  neue Kurse.
- **Kurs wählen**: Die Karten zeigen Lektionen, Übungen und wie viele davon geschafft sind (mindestens 90 % in einem
  Durchgang).
- **Üben**: Der Knopf startet die Übung auf der Übungsseite – mit Spielmodus, Tempo und *Tempo steigern* wie im Kurs
  vorgesehen. Oben steht der Kurs mit Beschreibung der Übung; *Nächste ▶* führt zur folgenden Übung.

Wie man selbst Kurse erstellt, steht in der Datei `MODULE.md` (im Programmordner bzw. im Quellcode).

## 8. Nachanalyse und Review

Jeder Durchgang wird aufgenommen. Nach dem Ende wertet die App die Aufnahme noch einmal in Ruhe aus – mit Blick auf den
ganzen Durchgang. Das erkennt besonders schnelle Passagen zuverlässiger als die Live-Wertung.

Nach dem Durchgang steht auf der Übungsseite **„Live … % → Endwert … %“**. Die Statistik zeigt den Endwert ebenfalls.

**Review ansehen** (oder in der Statistik auf den Endwert klicken) zeigt die Wellenform der Aufnahme:

- oben die erwarteten Noten – grün Treffer, gelb zu früh/zu spät, rot falscher Ton oder Oktave, grauer Ring nicht
  gespielt;
- unten die erkannten Noten – orange: zusätzlich gespielt;
- ein Klick auf eine Stelle spielt sie über dein Audio-Interface ab; *■ Stopp* beendet das.

Die Liste darunter zeigt Fehler und Stellen, an denen Live-Wertung und Nachanalyse unterschiedlich urteilen.
Aufgehoben werden die Aufnahmen der letzten 25 Durchgänge.

---

## 9. Statistik

Seite *Statistik* (für das gewählte Instrument):

- **Heatmap** der Trefferquote je Ton auf dem Griffbrett und im Notensystem (rot → gelb → grün; grau = noch nicht
  geübt);
- **schwächste Töne** mit Quote, Reaktionszeit bzw. Timing;
- **häufigste Verwechslungen** (welchen Ton du statt welchem spielst);
- **letzte Durchgänge** mit Stufe, Modus, Quote, Endwert, Punkten und Dauer.

*Statistik für … löschen* entfernt alle Daten des Instruments (nach Rückfrage).

---

## 10. Effekte und Plugins

Seite *Effekte*. Die Effekte wirken nur auf das **Mithören** (Mithören muss an sein) – die Tonerkennung bekommt immer
das unbearbeitete Signal, Lied und Metronom bleiben unverändert.

**Eigene Effekte** in fester Reihenfolge: Kompressor → Verzerrung (Overdrive, Distortion, Fuzz; *Clean-Anteil* hält
beim Bass die Tiefen) → Equalizer → Chorus → Delay → Hall. Jeder Effekt hat einen Ein/Aus-Schalter und Regler.

**Presets**: Trocken, Clean mit Hall, Crunch, Lead, Ambient, Bass clean, Bass Drive. Eigene Einstellungen speicherst du
unter einem Namen (*Speichern*) und löschst sie mit *Preset löschen*. *Alle aus* schaltet alles ab.

**VST3-Plugins** (z. B. Guitar Rig, Effekte von Native Instruments oder anderen Herstellern):

1. *Plugins suchen* – durchsucht `C:\Program Files\Common Files\VST3`.
2. Ein Plugin wählen und *Einsetzen*. Es läuft nach den eigenen Effekten.
3. *Oberfläche* öffnet das Plugin in einem eigenen Fenster; dort stellst du es ein (z. B. ein Guitar-Rig-Preset).
4. Mit ▲/▼ die Reihenfolge ändern, mit dem Schalter umgehen, mit *Entfernen* herausnehmen.

Die Plugin-Kette samt Einstellungen jedes Plugins wird gespeichert und beim nächsten Start wiederhergestellt. Die
angezeigte Latenz der Plugins verzögert nur das Mithören, nicht die Bewertung.

---

## 11. Stimmgerät und Kalibrierung

**Stimmgerät**: zeigt Ton, Oktave und Abweichung in Cent.

**Kalibrierung** (*Einstellungen → Kalibrierung*): Die App lernt dein Instrument und deinen Anschlag kennen.

1. **Ruhe-Messung**: nicht spielen – die App misst das Grundrauschen und schlägt eine Gate-Schwelle vor.
2. **Übungen** (Einzeltöne, Lagen & Oktaven, Legato, Tempo & Wiederholungen): die angezeigten Töne nachspielen. Das
   Griffbrett zeigt, wo sie liegen.
3. **Optimieren** (*Parameter optimieren*): Die App probiert viele Einstellungen der Erkennung an deinen Aufnahmen aus und schlägt die beste vor;
   übernommen wird erst nach deiner Bestätigung.
4. **Timing messen**: Tempo wählen, *Messung starten*, die Saiten mit der Greifhand abdämpfen und nach vier Klicks
   Vorzähler 16 Schläge lang genau auf den Klick anschlagen. Die App misst, wie weit deine Anschläge nach Abzug der
   Treiber-Latenz neben dem Klick liegen, und schlägt diesen Wert als *Timing-Ausgleich* vor (gilt für getaktetes
   Üben, Mitspielen und Rhythmus). Bei großer Streuung lieber noch einmal messen.

Kalibriere neu, wenn du Instrument, Tonabnehmer, Interface oder Eingangsverstärkung deutlich änderst.

---

## 12. Tipps und Fehlerbehebung

| Problem | Lösung |
|---|---|
| Kein Ton zu hören | Ausgang unter *Audio & Erkennung* prüfen; *Mithören* an? Lautstärke des Mithörens? |
| Es knackt oder setzt aus | Puffergröße erhöhen; große Plugin-Racks (Guitar Rig) brauchen Rechenleistung. |
| Spürbare Verzögerung beim Spielen | Treiber *Windows Audio (Exclusive Mode)* oder *Low Latency Mode* wählen; kleinere Puffergröße (z. B. 128 Samples). |
| Töne werden nicht erkannt | Eingangsverstärkung erhöhen; Gate-Schwelle senken; Instrument und Stimmung prüfen; kalibrieren. |
| Falsche Töne/Oktaven werden erkannt | Stimmen; Gate-Schwelle etwas erhöhen (mitklingende Saiten); kalibrieren. |
| Treffer durchweg „zu spät“ | *Timing messen* in der Kalibrierung oder *Timing-Ausgleich* auf der Übungsseite anpassen. |
| Lied klingt nach billigem Synthesizer | Eigenen Soundfont wählen (*Klang der Liedwiedergabe*). |
| Lied lässt sich nicht öffnen | Nur Guitar-Pro-Dateien (.gp/.gpx/.gp3–.gp5) werden unterstützt. |
| App startet nach Einsetzen eines Plugins nicht mehr | Im Datenordner die Datei `plugin-rack.json` löschen. |

Erkennungsfehler melden: *Diagnose-Aufnahme* einschalten, den Fehler nachspielen und die Dateien aus
`Dokumente\Fretboard Trainer\Diagnose` mitschicken.

---

## 13. Daten, Versionen, Lizenz

**Datenordner** `%APPDATA%\FretboardTrainer` (im Explorer in die Adresszeile eingeben):

| Datei/Ordner | Inhalt |
|---|---|
| `settings.xml` | Einstellungen |
| `stats.sqlite` | Statistik |
| `recordings\` | Aufnahmen und Nachanalyse der letzten 25 Durchgänge |
| `calibration\` | Kalibrier-Aufnahmen |
| `plugins.xml`, `plugin-rack.json` | gefundene Plugins, Plugin-Kette |

Diagnose-Aufnahmen liegen unter `Dokumente\Fretboard Trainer\Diagnose`.

**Versionen** haben die Form **VV.BB.II**: VV = öffentliche Versionen, BB = Beta-Versionen, II = interne Versionen.
00.00.02 ist die zweite interne Version. Die Version steht oben rechts in der App.

**Lizenz**: AGPLv3. Verwendet JUCE 8 (AGPLv3), alphaTab (MPL-2.0) mit der Schrift Bravura (SIL OFL 1.1) und dem
Soundfont Sonivox (Apache 2.0), TinySoundFont (MIT) und SQLite (gemeinfrei).
VST3 ist eine Marke der Steinberg Media Technologies GmbH.
