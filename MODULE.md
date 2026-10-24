# Kurse erstellen (Module)

Ein **Kurs** (Modul) ist ein Ordner mit einer Datei `module.json` und den Übungsdateien. Die App sucht Kurse in
ihren Kursordnern – dem Standardordner `Dokumente\Fretboard Trainer\Module` und allen Ordnern, die man auf der Seite
*Kurse* mit *Ordner hinzufügen …* einträgt. Jeder Unterordner mit einer `module.json` ist ein Kurs.

```
Module\
  Bass-Grundlagen\
    module.json
    uebungen\
      01-chromatik.tex
      02-grundtoene.tex
    riff.gp5
```

Einen Kurs weitergeben = den Ordner weitergeben (z. B. als ZIP); der Empfänger legt ihn in einen seiner Kursordner
und klickt auf *Neu einlesen*.

## module.json

```json
{
  "format": 1,
  "id": "bass-grundlagen",
  "title": "Bass-Grundlagen",
  "author": "Max Muster",
  "version": "1.0",
  "license": "CC BY 4.0",
  "instrument": "bass",
  "description": "Erste Schritte auf dem E-Bass: Fingertechnik, Grundtöne, einfache Riffs.",
  "lessons": [
    {
      "title": "Aufwärmen",
      "description": "Jeden Tag vor dem Üben.",
      "exercises": [
        {
          "id": "01",
          "title": "Chromatik 1-2-3-4",
          "description": "Ein Finger pro Bund, auf und ab. Gleichmäßig anschlagen.",
          "file": "uebungen/01-chromatik.tex",
          "mode": "songPlay",
          "loop": true,
          "tempo": { "start": 50, "target": 100, "step": 5 }
        },
        {
          "id": "02",
          "title": "Riff aus dem Lied",
          "file": "riff.gp5",
          "track": 1,
          "bars": [5, 8],
          "mode": "songWait"
        }
      ]
    }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | empfohlen | Kennung des Kurses (Buchstaben, Ziffern, Bindestriche). Unter ihr führt die Statistik den Fortschritt – nach der Veröffentlichung nicht mehr ändern. Ohne `id` gilt der Ordnername. |
| `title` | ja | Name des Kurses |
| `author`, `version`, `license`, `description` | nein | Angaben zum Kurs |
| `instrument` | nein | `bass` oder `guitar` (alle Varianten) oder eine genaue Instrument-Id wie `bass5`, `guitar7`, `violin`. Passt das eingestellte Instrument nicht, zeigt die App einen Hinweis. |
| `lessons` | ja | Lektionen in Reihenfolge, je mit `title`, optional `description`, und `exercises` |

**Übung** (`exercises`):

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | empfohlen | Kennung der Übung, eindeutig im Kurs (Statistik: `<Kurs-id>/<Übungs-id>`) |
| `title` | ja | Name der Übung |
| `description` | nein | Erklärung, erscheint in der Übersicht und beim Üben |
| `file` | ja | Übungsdatei, **relativ zum Kursordner** (nur innerhalb des Kursordners): Guitar Pro (`.gp`, `.gpx`, `.gp5`, `.gp4`, `.gp3`) oder alphaTex (`.tex`) |
| `track` | nein | Spur in der Datei, ab 0 (Standard 0) |
| `bars` | nein | Taktbereich `[von, bis]`, ab 1 (Standard: ganze Datei) |
| `mode` | nein | Spielmodus beim Start: `songPlay` (Lied mitspielen), `songWait` (Lied wartet auf dich), `timed` (getaktet, reine Tonfolge) oder `auto` (nach Stufe, Standard) |
| `loop` | nein | Bereich wiederholen (`true`/`false`) |
| `tempo` | nein | in Prozent des Tempos der Datei: `start` (Starttempo); mit `target` wird *Tempo steigern* eingeschaltet (bis `target`, in Schritten von `step` %, Standard 5). Erlaubt sind 20–150 %. |

Fehlerhafte Angaben verhindern nicht das Laden: Die App zeigt beim Kurs *Hinweise zur module.json* und lässt
betroffene Übungen weg. Eine Übung gilt als geschafft, sobald ein Durchgang mindestens 90 % erreicht (Endwert der
Nachanalyse, sonst Live-Wertung).

## Übungen in alphaTex schreiben

alphaTex ist ein Textformat für Noten und Tabulatur ([Dokumentation](https://alphatab.net/docs/alphatex/introduction)).
Eine Übung mit Tempo, Stimmung (tiefste Saite zuletzt) und Takten:

```
\title "Chromatik 1-2-3-4"
\tempo 120
.
\track "Bass"
\tuning (G2 D2 A1 E1)
\instrument 33
\clef F4 :8 1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 | 4.3 3.3 2.3 1.3 4.4 3.4 2.4 1.4 |
```

- `\instrument 33` ist der Klang „E-Bass (Finger)“; `\clef F4` vor dem ersten Takt setzt den Bassschlüssel
  (ohne Angabe zeigt alphaTex den Violinschlüssel). Für Gitarre `\clef G2` oder weglassen.

- Eine Note ist `Bund.Saite`, Saite 1 = höchste. `:4` setzt den Notenwert (1 Ganze, 2 Halbe, 4 Viertel, 8 Achtel,
  16 Sechzehntel) für die folgenden Noten; `r` ist eine Pause; `|` trennt Takte.
- Punktiert: `3.2.4 {d}`; Hammer-on/Pull-off: `5.3{h} 7.3`; Akkord: `(0.3 2.2)`.
- Die App spielt die Übung wie ein Lied ab (mit Noten, Tabulatur, Cursor und Wiedergabe der eigenen Stimme).

## Urheberrecht

Übungen aus fremden Büchern, Lehrwerken oder Liedern nur weitergeben, wenn die Rechte das erlauben. Für den eigenen
Gebrauch kann man solche Übungen lokal als Kurs anlegen – sie gehören dann nicht in öffentlich geteilte Kurse.
