# Calyndra Mapmaker

**Prozeduraler Fantasy-Kartengenerator** fur das Calyndra-Universum.  
Generiert hochauflosende Welt-, Stadt- und Kampfkarten direkt im Browser.

![Status](https://img.shields.io/badge/Status-In%20Entwicklung-orange)
![Tech](https://img.shields.io/badge/Tech-Vanilla%20JS%20%2B%20Canvas-blue)
![License](https://img.shields.io/badge/Lizenz-MIT-green)

---

## Features

### Weltkarte
- Prozedurale Landmassen mit Simplex Noise und Domain Warping
- Terrain: Ozean, Kuste, Grasland, Wald, Wuste, Gebirge, Schnee
- Automatische Flusse (fliessen bergab), Stadte, Strassen
- Fantasy-Namengenerator fur Stadte, Flusse und Gebirge
- Kompassrose, Massstabsleiste, dekorativer Kartenrand
- Stile: Farbig oder Pergament
- Kontinentformen: Naturlich, Insel, Pangaa
- **Zoombare Karte**: Klicke auf Stadte um zur Stadtkarte zu zoomen

### Stadtkarte
- Detaillierte Stadtlayouts mit Distrikten (Markt, Tempel, Handwerk, Adel, etc.)
- Drei Baustile: Menschen, Elfen, Zwerge (oder gemischt)
- Stadtmauern mit Turmen und Toren
- Radiale und Ringstrassen
- Landmarks: Tempel, Taverne, Marktplatz, Burg, Garten
- Umgebende Vegetation
- **Lore-Integration**: NPC-Marker, Fraktions-Anzeige

### Kampfkarte
- Rasterbasierte taktische Karten
- 7 Gelandetypen: Grasland, Wald, Dungeon, Hohle, Wuste, Schnee, Sumpf
- Wasserfeaturen: Bach, Teich, Fluss
- **Interaktives Token-System**: Klicke auf das Raster um Gegner zu platzieren
- 16 vordefinierte Gegnertypen (Goblin, Ork, Drache, Lich, etc.)
- Koordinatensystem (A1, B2, etc.)
- Konfigurierbare Rastergrosse

### Lore-System (NEU)
- **JSON Import/Export**: Lade deine Welt-Daten aus deinem Buchprojekt
- **Eingebauter Editor**: Regionen, Stadte, Landmarken, Flusse, Strassen, Fraktionen, NPCs
- **Automatische Integration**: Lore-Daten fliessen direkt in die Kartengenerierung ein
- **Persistenz**: Daten werden im Browser gespeichert (localStorage)
- **Beispiel-Datei**: `examples/calyndra-lore.json` als Vorlage

### Zoom-Navigation (NEU)
- **Weltkarte -> Stadt**: Klicke auf eine Stadt in der Weltkarte um reinzuzoomen
- **Breadcrumbs**: Navigation zuruck zur Ubersicht
- **Lore-verbunden**: Zoom verwendet automatisch die Stadtdaten aus dem Lore-System
- **Tastatursteuerung**: `Esc` zum Zuruckkehren

### Programmatische Assets
Alle Kartenelemente werden direkt auf dem Canvas gezeichnet -- keine externen Bilder notig:
- Gebaude: Menschenhauser, Elfenhauser, Zwergenhauser, Turme, Tempel, Tavernen, Burgen
- Gelande: Berge, Vulkane, Laub-/Nadelbaume, Flusse, Brucken
- Dekorationen: Kompassrose, Kartenrand, Massstabsleiste
- Tokens: Farbcodierte Gegner-Marker mit Symbolen

---

## Quickstart

```bash
# Repository klonen
git clone <repo-url>
cd Mapmaker

# HTTP-Server starten (fur ES Module Support)
python3 -m http.server 8000
# Dann http://localhost:8000 im Browser offnen
```

> **Hinweis**: Wegen ES Modules muss die Seite uber einen HTTP-Server geoffnet werden  
> (z.B. `python3 -m http.server`, VS Code Live Server, oder ahnlich).

### Lore-Daten laden

1. Auf den **Lore** Tab klicken
2. Die Beispieldatei `examples/calyndra-lore.json` hochladen (Drag & Drop oder Klick)
3. Oder eigene Daten im Editor eingeben
4. Zur Weltkarte wechseln -- deine Lore-Daten sind automatisch integriert!

### Eigene Lore-Datei erstellen

Die JSON-Struktur folgt diesem Schema:

```json
{
  "name": "Deine Welt",
  "description": "Beschreibung",
  "regions": [
    {
      "id": "region_1",
      "name": "Nordreich",
      "relX": 0.5,
      "relY": 0.2,
      "relRadius": 0.15,
      "climate": "arktisch",
      "terrain": "gebirge"
    }
  ],
  "cities": [
    {
      "id": "city_1",
      "name": "Hauptstadt",
      "size": "capital",
      "style": "human",
      "isCapital": true,
      "regionId": "region_1",
      "relX": 0.5,
      "relY": 0.2
    }
  ],
  "landmarks": [...],
  "rivers": [...],
  "roads": [...],
  "factions": [...],
  "npcs": [...]
}
```

Positionen (`relX`, `relY`) sind relative Werte von 0.0 (links/oben) bis 1.0 (rechts/unten).

---

## Projektstruktur

```
Mapmaker/
├── index.html          # Haupteinstiegspunkt
├── css/
│   └── style.css       # Fantasy-Theme (Dark/Parchment)
├── js/
│   ├── app.js          # Hauptanwendung + Plugin-Registry + Lore UI
│   ├── noise.js        # Simplex Noise Engine
│   ├── utils.js        # Farben, Namen, Helpers
│   ├── assets.js       # Programmatische Asset-Renderer
│   ├── lore.js         # Lore-Manager (Import/Export/Editor)
│   ├── zoomable.js     # Zoom-Navigation (Welt -> Region -> Stadt)
│   ├── worldmap.js     # Weltkarten-Generator (mit Lore + Zoom)
│   ├── citymap.js      # Stadtkarten-Generator (mit Lore)
│   └── battlemap.js    # Kampfkarten-Generator
├── examples/
│   └── calyndra-lore.json  # Beispiel Lore-Daten
└── README.md
```

---

## Architektur

### Plugin-System

Der Mapmaker verwendet eine **erweiterbare Plugin-Architektur**. Jeder Kartentyp ist ein eigenstandiger Generator, der sich in die zentrale Registry eintragt:

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

### Lore-System Architektur

```
lore.js (LoreManager)
  ├── Import: JSON-Datei -> Validierung -> Merge -> localStorage
  ├── Export: localStorage -> JSON-Datei
  ├── Editor: CRUD fur alle Entitaten
  ├── Bridge: getWorldMapHints() / getCityMapHints()
  └── Persistence: localStorage mit Auto-Save

worldmap.js ←── lore.getWorldMapHints() ──→ Stadte, Landmarks, Regionen
citymap.js  ←── lore.getCityMapHints()  ──→ NPCs, Fraktionen, Distrikte
```

### Zoom-System Architektur

```
zoomable.js (ZoomController)
  ├── Stack-basierte Navigation (push/pop)
  ├── Clickable Areas auf dem Canvas
  ├── Breadcrumb-Rendering
  └── Events: zoomIn, zoomOut, jumpTo, reset

Weltkarte (Stadte klickbar)
    └── Stadtkarte (mit Lore-Daten der geklickten Stadt)
        └── (zukunftig: Innenraume, Dungeons)
```

### Geplante Erweiterungen
- **Hohlenkarte**: Detaillierte Hohlensysteme mit Tunneln, Kammern, unterirdischen Seen
- **Schlachtfeldkarte**: Grosse Schlachten mit Truppenformationen
- **Innenraumkarte**: Dungeon-Raume, Tavernen-Innenraume
- **Seekarte**: Ozean, Inseln, Seerouten, Seeungeheuer
- **Region-Zoom**: Detaillierte Regionskarten zwischen Welt und Stadt

### Kontrolltypen

| Typ | Beschreibung |
|-----|-------------|
| `number` | Numerische Eingabe (z.B. Seed) |
| `range` | Slider mit min/max/step |
| `select` | Dropdown-Auswahl |
| `checkbox` | An/Aus-Toggle |
| `custom` | Benutzerdefiniertes UI (z.B. Token-Palette) |

---

## Tastaturkurzel

| Taste | Aktion |
|-------|--------|
| `R` | Zufalliger Seed + Generieren |
| `G` | Karte neu generieren |
| `Ctrl+E` | Als PNG exportieren |
| `Esc` | Zoom zurucksetzen (zur Weltkarte) |

---

## Technische Details

- **Noise Engine**: Eigene Simplex Noise Implementierung mit fBm, Ridge Noise und Domain Warping
- **Rendering**: Pixel-basiert via `ImageData` fur Terrain + Canvas 2D API fur Assets/Overlays
- **Lore-System**: JSON-basiert, localStorage-Persistenz, vollstandiger CRUD-Editor
- **Zoom-Navigation**: Stack-basiert mit Breadcrumbs, Canvas click-to-zoom
- **Performance**: Direkte Pixel-Manipulation fur schnelle Terrain-Generierung
- **Auflosungen**: Bis zu 4K (3840x2160) unterstutzt
- **Export**: PNG mit voller Canvas-Auflosung
- **Kein Build-Prozess**: Pure ES Modules, lauft direkt im Browser

---

## Lizenz

MIT License -- Frei verwendbar fur alle Projekte.
