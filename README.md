# Calyndra Mapmaker

**Prozeduraler Fantasy-Kartengenerator** für das Calyndra-Universum.  
Generiert hochauflösende Welt-, Stadt- und Kampfkarten direkt im Browser.

![Status](https://img.shields.io/badge/Status-In%20Entwicklung-orange)
![Tech](https://img.shields.io/badge/Tech-Vanilla%20JS%20%2B%20Canvas-blue)
![License](https://img.shields.io/badge/Lizenz-MIT-green)

---

## Features

### Weltkarte
- Prozedurale Landmassen mit Simplex Noise und Domain Warping
- Terrain: Ozean, Küste, Grasland, Wald, Wüste, Gebirge, Schnee
- Automatische Flüsse (fließen bergab), Städte, Straßen
- Fantasy-Namengenerator für Städte, Flüsse und Gebirge
- Kompassrose, Maßstabsleiste, dekorativer Kartenrand
- Stile: Farbig oder Pergament
- Kontinentformen: Natürlich, Insel, Pangäa

### Stadtkarte
- Detaillierte Stadtlayouts mit Distrikten (Markt, Tempel, Handwerk, Adel, etc.)
- Drei Baustile: Menschen, Elfen, Zwerge (oder gemischt)
- Stadtmauern mit Türmen und Toren
- Radiale und Ringstraßen
- Landmarks: Tempel, Taverne, Marktplatz, Burg, Gärten
- Umgebende Vegetation

### Kampfkarte
- Rasterbasierte taktische Karten
- 7 Geländetypen: Grasland, Wald, Dungeon, Höhle, Wüste, Schnee, Sumpf
- Wasserfeaturen: Bach, Teich, Fluss
- **Interaktives Token-System**: Klicke auf das Raster um Gegner zu platzieren
- 16 vordefinierte Gegnertypen (Goblin, Ork, Drache, Lich, etc.)
- Koordinatensystem (A1, B2, etc.)
- Konfigurierbare Rastergröße

### Programmatische Assets
Alle Kartenelemente werden direkt auf dem Canvas gezeichnet — keine externen Bilder nötig:
- Gebäude: Menschenhäuser, Elfenhäuser, Zwergenhäuser, Türme, Tempel, Tavernen, Burgen
- Gelände: Berge, Vulkane, Laub-/Nadelbäume, Flüsse, Brücken
- Dekorationen: Kompassrose, Kartenrand, Maßstabsleiste
- Tokens: Farbcodierte Gegner-Marker mit Symbolen

---

## Quickstart

```bash
# Repository klonen
git clone <repo-url>
cd Mapmaker

# Einfach öffnen — kein Build, kein Server nötig!
open index.html
# oder
python3 -m http.server 8000  # für ES Module Support
```

> **Hinweis**: Wegen ES Modules muss die Seite über einen HTTP-Server geöffnet werden  
> (z.B. `python3 -m http.server`, VS Code Live Server, oder ähnlich).

---

## Projektstruktur

```
Mapmaker/
├── index.html          # Haupteinstiegspunkt
├── css/
│   └── style.css       # Fantasy-Theme (Dark/Parchment)
├── js/
│   ├── app.js          # Hauptanwendung + Plugin-Registry
│   ├── noise.js        # Simplex Noise Engine
│   ├── utils.js        # Farben, Namen, Helpers
│   ├── assets.js       # Programmatische Asset-Renderer
│   ├── worldmap.js     # Weltkarten-Generator
│   ├── citymap.js      # Stadtkarten-Generator
│   └── battlemap.js    # Kampfkarten-Generator
└── README.md           # Diese Datei
```

---

## Architektur

### Plugin-System

Der Mapmaker verwendet eine **erweiterbare Plugin-Architektur**. Jeder Kartentyp ist ein eigenständiger Generator, der sich in die zentrale Registry einträgt:

```javascript
// Eigenen Generator erstellen
export class MeinGenerator {
    static id = 'mein-typ';
    static label = 'Mein Kartentyp';
    static icon = '🏔️';

    constructor() {
        this.defaultConfig = { /* ... */ };
    }

    getControls() {
        return [
            { type: 'range', key: 'param', label: 'Parameter', min: 0, max: 100 },
            // ...
        ];
    }

    generate(canvas, config) {
        // Canvas-Rendering hier
    }
}
```

```javascript
// In app.js registrieren
import { MeinGenerator } from './mein-generator.js';
this.registry.register(MeinGenerator);
```

### Geplante Erweiterungen
- **Höhlenkarte**: Detaillierte Höhlensysteme mit Tunneln, Kammern, unterirdischen Seen
- **Schlachtfeldkarte**: Große Schlachten mit Truppenformationen
- **Innenraumkarte**: Dungeon-Räume, Tavernen-Innenräume
- **Seekarte**: Ozean, Inseln, Seerouten, Seeungeheuer

### Kontrolltypen

| Typ | Beschreibung |
|-----|-------------|
| `number` | Numerische Eingabe (z.B. Seed) |
| `range` | Slider mit min/max/step |
| `select` | Dropdown-Auswahl |
| `checkbox` | An/Aus-Toggle |
| `custom` | Benutzerdefiniertes UI (z.B. Token-Palette) |

---

## Tastaturkürzel

| Taste | Aktion |
|-------|--------|
| `R` | Zufälliger Seed + Generieren |
| `G` | Karte neu generieren |
| `Ctrl+E` | Als PNG exportieren |

---

## Technische Details

- **Noise Engine**: Eigene Simplex Noise Implementierung mit fBm, Ridge Noise und Domain Warping
- **Rendering**: Pixel-basiert via `ImageData` für Terrain + Canvas 2D API für Assets/Overlays
- **Performance**: Direkte Pixel-Manipulation für schnelle Terrain-Generierung
- **Auflösungen**: Bis zu 4K (3840×2160) unterstützt
- **Export**: PNG mit voller Canvas-Auflösung
- **Kein Build-Prozess**: Pure ES Modules, läuft direkt im Browser

---

## Lizenz

MIT License — Frei verwendbar für alle Projekte.
