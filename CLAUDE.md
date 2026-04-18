# CLAUDE.md — Projekt-Kontext für Claude Code

## Was ist dieses Projekt?

**Calyndra Mapmaker** — ein Fantasy-Kartengenerator der sich zum Story-Worldbuilding-Tool entwickelt.

Zwei Modi:
1. **Prozedurale Generatoren** (Worldmap, Citymap, Battlemap) — zufällige Karten aus Seeds
2. **Story Map** (Erzählkarte) — rendert eine spezifische Welt aus JSON-Daten mit Kapitel-basierter progressiver Enthüllung

Der User ist ein **Autor** der das Tool für sein Buch "Calyndra" nutzt. Die Welt wächst organisch mit der Geschichte: Kapitel für Kapitel werden neue Orte enthüllt, Gebäude zerstört, übernatürliche Effekte sichtbar.

## Tech-Stack

- React 19 + TypeScript + Vite 8
- Canvas 2D für alle Karten-Rendering
- Keine externe State-Library (useState + useRef + useCallback)
- StrictMode aktiv (Effects double-invoken in Dev)
- Deploy: GitHub Pages via Actions (auto-deploy auf Push)

## Architektur-Entscheidungen

### Generatoren sind Klassen mit `generate(canvas, config)`
Registriert in `GeneratorRegistry`. Jeder Generator hat `getControls()` für Sidebar-UI und `defaultConfig`. Der StoryMapGenerator folgt demselben Pattern.

### `generate()` ist referentiell stabil ([] deps)
Liest `activeGenerator`, `config`, `isGenerating` aus Refs statt Closure-Deps. Das verhindert die Kaskade: config-Änderung → generate-Identität → handleCanvasReady-Identität → MapCanvas-Effect → ungewollter Re-Generate. War der Kern-Performance-Bug.

### MapCanvas.onCanvasReady feuert nur einmal
Ref-latched Pattern mit `[]`-deps Effect. Verhindert Re-Generate bei jedem App-Render.

### Zoom-Sync-Effect hat `activeGenerator` NICHT in deps
Absichtlich, mit eslint-disable. Wenn activeGenerator in deps wäre, würde jeder manuelle Generator-Wechsel (Sidebar) sofort zu worldmap revertiert, weil der Effect `zoom.level === 'world' && activeGenerator.id !== 'worldmap'` → `switchGenerator('worldmap')` triggert. Stattdessen bail-check via prev-zoom-key Ref.

### setPointerCapture erst bei Drag-Threshold
Nicht bei pointerdown, sondern erst in pointermove nach 6px Bewegung. Sonst redirected Pointer Capture alle Mouse-Events (inkl. click) zum Wrapper, und der native Click-Handler am Canvas (useZoom) wird nie erreicht.

### useZoom Return-Objekt ist memoized
Controller, breadcrumbs, zoomIn sind alle stabil. Verhindert Identity-Churn der durch handleCanvasReady, Sidebar-Callbacks etc. propagiert.

### Story-Daten: eigener Hook statt useLore erweitern
`useStoryEditor` ist komplett getrennt von `useLore`. Anderes Schema, andere Persistenz (localStorage statt LoreManager), andere CRUD-Operationen. Mixing hätte `LoreData` und `LoreManager` aufgebläht.

### Terrain für Story Map: Moisture-Bias statt Overlays
Statt Region-Overlays (die als hässliche Balken sichtbar waren) wird die Moisture-Map direkt manipuliert: West = hohe Feuchtigkeit (Wald-Biom), Ost = moderate Feuchtigkeit (grünes Farmland). Die Waldkante ist noise-perturbed für natürlichen Verlauf. Das Terrain selbst trägt die Geografie, keine Overlays nötig.

### seaLevel = 0 für die Story Map
Die Story spielt in einem Binnenland-Grenzgebiet. Kein Ozean, keine Küste, keine Wassereffekte aus dem Heightmap. Der Seren-Fluss wird separat gerendert (story-spezifisch, nicht prozedural).

## Wichtige Dateien

### Story Map Engine
- `src/engine/generators/storymap/storymap-generator.ts` — Hauptklasse
- `src/engine/generators/storymap/world-renderer.ts` — Welt-Übersicht (Terrain + Story-Overlay)
- `src/engine/generators/storymap/explored-area.ts` — Terra Incognita Masking
- `src/engine/generators/storymap/svg-path.ts` — SVG-Bezier-Parser
- `src/engine/generators/storymap/data-loader.ts` — JSON-Loader + Query-Helpers
- `src/engine/generators/storymap/types.ts` — TypeScript-Typen für alle 5 JSONs

### Admin-Editor
- `src/hooks/useStoryEditor.ts` — CRUD + localStorage + Auth
- `src/components/Sidebar/AdminPanel.tsx` — UI mit Passwort-Gate

### Performance-kritische Hooks
- `src/hooks/useGenerator.ts` — Refs für stabile generate-Identität
- `src/hooks/useZoom.ts` — Memoized Return, stabile Callbacks
- `src/components/Canvas/MapCanvas.tsx` — Deferred Pointer Capture

### Story-Daten
- `examples/calyndra/` — 5 JSON-Dateien (Regionen, Orte, Charaktere, Features, Pfade)

## Code-Konventionen

- **UI-Texte**: Deutsch (Sidebar, Controls, Labels)
- **Story-Daten**: Bilingual (DE/EN) via `BiText` type
- **Commit-Messages**: Englisch, mit Prefix (feat/fix/perf/docs)
- **Kommentare**: Nur wo das WARUM nicht offensichtlich ist
- **Keine Emojis** in Code/Docs (außer Generator-Icons in der UI)

## Bekannte Eigenheiten

- **StrictMode**: Effects double-invoken auf Mount. Refs überleben das, State-Setters sind idempotent. Der Registry-Setup-Effect erstellt zwei GeneratorRegistry-Instanzen — die zweite gewinnt.
- **Heightmap-Patching**: In der Story Map werden Heightmap-Werte < 0.05 nach oben korrigiert um blaue Wasser-Flecken zu verhindern (seaLevel=0 allein reicht nicht weil der Noise negative Werte erzeugt).
- **Explored-Mask**: Offscreen-Canvas mit Radial-Gradienten pro Ort + Korridoren entlang Pfaden. Wird via `destination-in` Composite als Alpha auf den Terrain-Canvas angewandt.
- **Lint**: 69 pre-existing Errors (hauptsächlich LoreManager.ts + battlemap.ts implicit-any). Nicht durch unsere Änderungen eingeführt.

## User-Workflow

1. Autor schreibt Kapitel seiner Geschichte
2. Fügt neue Orte/Pfade via Editor-Tab (🔧) im Mapmaker hinzu
3. Setzt Kapitel-Slider auf das aktuelle Kapitel → Karte zeigt nur Erforschtes
4. Exportiert Karte als PNG für Buchseiten oder Web-Embed
5. Nächstes Kapitel → neue Orte erscheinen, alte verändern sich

## Nächste Schritte

Siehe `ROADMAP.md` für die komplette Feature-Planung.
Priorität: Detail-Karten (Klick auf Ort) → Layer-System → Export-Pipeline
