# Calyndra Mapmaker — Roadmap

## Bereits gebaut

### Performance-Optimierungen
- `useGenerator.generate` stabilisiert via Refs (keine Kaskaden-Rerenders)
- `MapCanvas.onCanvasReady` feuert nur einmal beim Mount
- `useZoom` Return-Objekt memoized (stabile Identität)
- `setPointerCapture` auf Drag-Threshold verzögert (Click-to-Zoom funktioniert)
- `usePlacedAssets` localStorage-Writes 300ms debounced
- Zoom-Mousemove rAF-throttled mit Cursor-Cache
- View-State-Updates rAF-coalesced
- Battlemap-Hover via Overlay-Snapshot statt Full-Regen
- Regen-Debounce 180ms → 100ms

### Story Map Generator (Phase 1 — Grundlagen)
- `StoryMapGenerator` Klasse mit Kapitel-Config
- SVG-Path-Parser für Bezier-Kurven aus JSON-Daten
- Daten-Loader für alle 5 Calyndra-JSONs
- Kapitel-Slider UI (P, 1-7 Buttons + Range)
- Prozedurales Terrain (Book-Style) als Basis
- Moisture-Gradient: Wald im Westen, Farmland im Osten
- Unregelmäßige Waldkante via Noise-Perturbation
- Seren-Fluss durch Willow Brook
- Farbige Feld-Parzellen im Osten (Flickwerk)
- Explored-Area-Maske (Terra Incognita)
- Dynamischer Viewport (Karte wächst mit neuen Orten)
- Typ-spezifische Ort-Icons (Dorf/Farm/Teich/Wahrzeichen/Höhle/etc.)
- Lesbare Labels mit Pergament-Kartusche
- Titel-Kartusche mit Kapitel-Anzeige
- Charakter-Marker (farbige Punkte pro Kapitel)
- Übernatürliche Indikatoren (farbige Auren)
- Zerstörungs-States (rotes Glühen + Rauch)
- Klickbare Orte für Zoom-in

### Admin-Editor
- Passwort-Gate (SHA-256, localStorage)
- Location CRUD (Name, Typ, Koordinaten, Kapitel, Beschreibung)
- Path CRUD (Von/Nach, automatische SVG-Linie)
- Orts- und Pfad-Listen mit Löschen
- JSON Export/Import
- Auto-Save in localStorage (500ms Debounce)
- Zurücksetzen auf Original-Daten

### Bug-Fixes
- Zoom-Sync revertierte manuelle Generator-Auswahl
- City-Name/Size/Style von Worldmap an Citymap durchgereicht
- Click-to-Zoom via setPointerCapture blockiert

---

## Phase 1 — Noch offen

### Detail-Karten — Grundsystem ✅ (erster Entwurf steht)
- ✅ Klick auf Ort → Detail-View mit Gebäuden aus JSON
- ✅ Gebäude nach `minChapter` gefiltert
- ✅ Zerstörte Gebäude (`destroyedChapter`) visuell markiert (rotes X)
- ✅ Lokale Pfade innerhalb des Ortes gerendert
- ✅ Fluss Seren durch Willow Brook
- ✅ Charakter-Marker + Übernatürliche Auren
- ✅ ESC → zurück zur Weltkarte

### Detail-Karten — Ortsspezifische Verbesserungen
Jeder Ort braucht seine eigene visuelle Ausarbeitung:

**Willow Brook (Dorf)**
- Fluss Seren mit Brücke + Trittsteinen (aus JSON crossings)
- Weidenzweige am Flussufer
- Strohgedeckte Häuser statt generischer Rechtecke
- Mühle am Fluss (drehendes Mühlrad als Icon)
- Rauchende Schornsteine
- Kräutergarten-Textur für Meiras Garten
- Tempel mit Turm als dominantes Gebäude
- Marktplatz mit Brunnen in der Mitte
- Feldwege zwischen den Häusern
- Atmosphäre: warm, golden (Spätsommer)
- Kapitel 6: Flammen, Rauch, zerstörte Gebäude rot/schwarz

**Alwins Gehöft (Farm)**
- Zersplitterter Schafspferch (ab Kapitel 1 zerstört)
- Einzelnes Bauernhaus mit offenem Tor
- Weideland-Hügel im Hintergrund
- Holzstapel ordentlich gestapelt
- Steinbrunnen im Hof
- Steinkreuz mit Mondlicht-Schimmer (übernatürlich)
- Atmosphäre: verlassen, windige Hügel

**Spiegelteich (Gewässer)**
- Großer Teich mit Spiegeleffekt (schwarzes Glas)
- Umgestürzter Baumstamm als Brücke über den Teich
- Schilfgürtel am Südufer
- Alte Buche am Ostufer
- Unnatürliche Gespinste in den Bäumen (ab Kapitel 1)
- Bemooste Steine am Westufer
- Atmosphäre: still, neblig, unheimlich ab Kapitel 2

**Die Alte Eiche (Wahrzeichen)**
- Kolossaler Eichenbaum als Zentrum (übergroßes Icon)
- Kreisrunde Lichtung drumherum
- Zwei massive Wurzelstränge nach Süden
- Farngestrüpp am Rand
- Alwins letzte Fußspuren (ab Kapitel 1, enden abrupt)
- Vibrations-Aura (goldenes Glühen ab Kapitel 1)

**Rotader Senke (Höhle/Senke)**
- Flache Mulde mit dunklem Boden
- Zwei Wurzelstränge (links/rechts) die auseinanderlaufen
- Rötlicher Tümpel in der Mitte (unnatürliches Glimmen ab Kapitel 1)
- Moosteppich der Schritte verschluckt
- Lehmhang am Rand
- Atmosphäre: süßlicher Geruch, bedrohlich rot

**Fuchsbau (Unterschlupf)**
- Halb entwurzelte Kiefer als Eingang
- Unterirdische Hauptkammer mit Wurzelgewölbe
- Seitentunnel in die Dunkelheit (ab Kapitel 3)
- Wurzelgeflecht-Decke mit rötlichem Staub
- Heilungsstelle (blaues Leuchten ab Kapitel 3)
- Moosbett wo Corin bewusstlos liegt
- Atmosphäre: feucht, erdig, eng

**Nebelruh (Walters Jagdhütte)**
- Solide Holzhütte mit Steinschornstein
- Feuerstelle mit Rauch
- Übungsplatz (Trainingsgelände)
- Ausguck (erhöhter Posten)
- Natürliche Quelle am Hang
- Vorratslager + Holzstapel
- Atmosphäre: neblig, sicher, rustikal

**Waldsenke (Kesselsenke)**
- Tiefe Mulde mit glattem Steinboden
- Gespinste in den Baumkronen (wie ein Nervennetz)
- Ausgelaugter Stein (ab Kapitel 6, grau/farblos)
- Strömungsrisse mit rotem Pulsieren (ab Kapitel 7)
- Bemooster Stamm mit blau leuchtendem Pilz
- Steiler Senkenrand
- Atmosphäre: dunkel, bedrohlich, das Netz IST der Boden

### Layer-System
- Layer-Panel in Sidebar
- Pro Layer: Sichtbarkeit Toggle, Freeze Button, Seed Reroll
- Layer: Terrain, Wald, Berge, Flüsse, Orte, Pfade, Charaktere, Übernatürlich
- Per-Layer-Seed für unabhängiges Neu-Würfeln
- Freeze = Cache des aktuellen Zustands
- Persistierung im Welt-Dokument (JSON)

### Editor-Verbesserungen
- Click-to-Place: Klick auf Karte setzt Koordinaten für neuen Ort
- Bézier-Pfad-Zeichnung: Klick-Klick-Klick für kurvige Wege
- Gebäude-Editor: Gebäude innerhalb eines Ortes hinzufügen/verschieben
- Ort bearbeiten (nicht nur hinzufügen/löschen)

### Kapitel-System erweitern
- Kapitel-spezifische Ort-Untertitel visuell anzeigen
- Übernatürliche Elemente visuell differenzieren (rot/blau/golden)
- Destruction-Events animiert (Übergang zwischen Kapiteln)

---

## Phase 2 — Export-Pipeline

### PNG/Tile-Export
- Export pro Kapitel (spoilerfrei für Leser)
- Verschiedene Auflösungen (Web, Print, 4K)
- Tile-basierter Export für große Karten

### Blender-Schnittstelle
- Heightmap als Displacement-Map exportieren (16-bit PNG)
- Gebäude-Positionen als JSON/glTF für Blender-Import
- Region-Grenzen als Curves
- Material-Zonen für automatisches Texturing

### Web-Embed
- Leichtgewichtige Read-Only-Komponente
- Kapitel-Gate: Leser sehen nur bis zum aktuellen Kapitel
- Interaktive Popups bei Ort-Hover (Beschreibung aus JSON)
- Responsive für Mobile

---

## Phase 3 — Grafik-Upgrades

### Schnelle Wins (je 1-3 Tage)
- Kurvige Beschriftungen entlang Flüssen/Küsten
- Höhenlinien (Contour Lines) entlang der Heightmap
- Atmosphärischer Dunst (Fern-Berge blaugrau)
- Weichere Biom-Übergänge (Gradient statt harte Kante)
- Bloom/Glühen auf Lichtern und magischen Effekten

### Mittlere Projekte (je 3-7 Tage)
- Erosions-Simulation für realistische Flusstäler
- Jahreszeiten-Varianten (Winter/Herbst/Sommer)
- Hand-gezeichneter Stil (Tintenwobble, Pinsel-Varianz)
- Aquarell-Bleeding-Effekt

### Große Projekte (je 1-4 Wochen)
- WebGL-Rendering (10× Performance)
- Tile-Caching (Instant-Zoom, Infinite Canvas)
- Isometrisches 2.5D-Rendering
- Animation (fließendes Wasser, Wolken, Tag/Nacht)
- Vector-Export (SVG für Print)

---

## Langfristige Vision

### Organisches Welt-Wachstum
- Geschichte startet in einem Dorf
- Erkundung erweitert die bekannte Welt
- Neue Regionen werden prozedural generiert
- Bestehende Regionen bleiben eingefroren
- Kapitel-für-Kapitel spoilerfreie Enthüllung

### 3D-Pipeline
- Mapmaker → Blender: Terrain + Gebäude als 3D-Szene
- Automatisches Texturing basierend auf Biom-Daten
- Kamera-Pfade entlang der Story-Route

### Homepage-Integration
- Interaktive Karte eingebettet auf der Buch-Website
- Leser erkunden die Welt parallel zum Lesen
- Spoiler-Gate per Kapitel-Freischaltung
- Chroniken-Timeline mit Events unter der Karte

---

## Daten-Architektur

### Welt-Dokument (examples/calyndra/)
```
world-regions.json    — 6 Regionen mit Grenzen, Klima, Nebel
locations.json        — 8 Orte, 60+ Gebäude, minChapter/destroyedChapter
characters.json       — 11 Charaktere, Aufenthaltsorte pro Kapitel
world-features.json   — Flüsse, Hügel, übernatürliche Elemente, Zerstörungs-Events
paths.json            — 10 Weltrouten + lokale Pfade pro Ort
```

### Editor-Persistenz
- Änderungen in localStorage (`calyndra-story-editor`)
- Original-JSONs werden nie verändert
- Export/Import als standalone JSON
- Passwort-Hash in localStorage (`calyndra-admin-hash`)

### Koordinaten-System
- Welt-Koordinaten: dynamisch aus Location-Bounds + 25% Padding
- Canvas-Koordinaten: über `worldToCanvas()` gemappt
- Detail-Karten: eigene viewBox pro Ort (z.B. 600×500)
