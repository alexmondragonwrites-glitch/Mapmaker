/**
 * Type definitions for the Calyndra story world document.
 *
 * These mirror the JSON schemas in examples/calyndra/ and are used
 * by the StoryMapGenerator and useWorldData hook. The JSON data is
 * never modified at runtime — these types are read-only views.
 */

// ── Bilingual text ──────────────────────────────────────────────

export interface BiText {
    de: string;
    en: string | null;
}

// ── Coordinates ─────────────────────────────────────────────────

/** World-level coordinate in the 1000×650 viewBox. */
export interface WorldCoord {
    x: number;
    y: number;
}

/** A parsed point from an SVG path (absolute canvas pixels after scaling). */
export interface Point {
    x: number;
    y: number;
}

/** Size descriptor for location detail maps. */
export interface DetailSize {
    w: number;
    h: number;
}

// ── Regions (world-regions.json) ────────────────────────────────

export type RegionType =
    | 'kingdom'
    | 'forest'
    | 'dark_forest'
    | 'mist_plains'
    | 'transitional_forest'
    | 'pastoral';

export interface WorldRegion {
    id: string;
    name_de: string;
    name_en: string;
    type: RegionType;
    labelPosition?: WorldCoord;
    description_de: string;
    description_en: string;
    boundary?: string;           // SVG path d-attribute
    climate?: string;
    climate_en?: string;
    fogArea?: { cx: number; cy: number; rx: number; ry: number };
    hills?: { cx: number; cy: number; rx: number; ry: number }[];
}

export interface WorldRegionsFile {
    meta: {
        project: string;
        book: string;
        mapTitle: string;
        mapViewBox: { width: number; height: number };
        languages: string[];
    };
    regions: WorldRegion[];
}

// ── Locations (locations.json) ──────────────────────────────────

export type LocationType =
    | 'village'
    | 'farm'
    | 'water'
    | 'landmark'
    | 'hollow'
    | 'shelter'
    | 'cabin'
    | 'darkwood';

export interface StoryBuilding {
    id: string;
    type: string;
    position: { x: number; y: number; w: number; h: number };
    label: BiText;
    description?: BiText;
    minChapter: number;
    destroyedChapter?: number;
}

export interface LocationSubtitle {
    minChapter: number;
    key: string;
    color: string | null;
}

export interface StoryLocation {
    id: string;
    type: LocationType;
    name: BiText;
    subtitle?: BiText;
    description: BiText;
    coordinates: WorldCoord;
    hasSubMap: boolean;
    destroyedMinChapter: number | null;
    svgSize?: DetailSize;
    subtitles?: LocationSubtitle[];
    buildings: StoryBuilding[];
    pond?: { cx: number; cy: number; rx: number; ry: number };
}

export interface LocationsFile {
    meta: { title: string; description: string; version: string; generated: string };
    locations: StoryLocation[];
}

// ── Characters (characters.json) ────────────────────────────────

export interface CharacterColors {
    hex: string;
    fill: string;
    stroke: string;
    primary: string;
    accent: string;
}

export interface CharacterLocation {
    locationId: string;
    buildingId: string;
    chapters: number[];
}

export interface StoryCharacter {
    name: string;
    role: BiText;
    colors: CharacterColors;
    locations: CharacterLocation[];
}

export interface CharactersFile {
    meta: { title: string; description: string; version: string; generated: string };
    characters: StoryCharacter[];
}

// ── World Features (world-features.json) ────────────────────────

export interface FeatureRegion {
    id: string;
    name: BiText;
    type: string;
    description: BiText;
    mapLabel?: { x: number; y: number; fontSize: number };
    svgPath?: string;
    gradient?: { type: string; id: string; colors: string[] };
    fogEffect?: { cx: number; cy: number; rx: number; ry: number };
}

export interface RiverCrossing {
    type: 'bridge' | 'ford';
    position?: { x: number; y: number; w: number; h: number };
    stones?: { x: number; y: number }[];
}

export interface StoryRiver {
    id: string;
    name: BiText;
    locationId: string;
    description: BiText;
    svgPath: string;
    width: number;
    crossings: RiverCrossing[];
}

export interface StoryHill {
    id: string;
    name: BiText;
    description: BiText;
    shapes: { cx: number; cy: number; rx: number; ry: number; opacity: number }[];
}

export interface SupernaturalElement {
    id: string;
    locationId: string;
    name: BiText;
    minChapter: number;
    position?: WorldCoord;
    description: BiText;
}

export interface DestructionEvent {
    id: string;
    chapter: number;
    affectedLocations: string[];
    name: BiText;
    description: BiText;
}

export interface WorldFeaturesFile {
    meta: { title: string; description: string; version: string; generated: string };
    regions: FeatureRegion[];
    rivers: StoryRiver[];
    hills: StoryHill[];
    supernaturalElements: SupernaturalElement[];
    destructionEvents: DestructionEvent[];
}

// ── Paths (paths.json) ──────────────────────────────────────────

export interface PathStyle {
    stroke: string;
    dash: string | null;
    width: number;
}

export interface WorldPath {
    id: string;
    from: string;
    to: string;
    name: BiText;
    style: PathStyle;
    svgPath: string;
    description: BiText;
}

export interface LocalPath {
    id: string;
    type: 'main' | 'secondary' | 'trail' | 'pilgrim';
    svgPath: string;
    name: BiText;
}

export interface PathsFile {
    meta: { title: string; description: string; version: string; generated: string };
    worldPaths: WorldPath[];
    localPaths: Record<string, LocalPath[]>;
}

// ── Aggregate ───────────────────────────────────────────────────

/** All story data loaded and indexed for fast lookup. */
export interface StoryWorldData {
    meta: WorldRegionsFile['meta'];
    regions: WorldRegion[];
    locations: StoryLocation[];
    characters: StoryCharacter[];
    featureRegions: FeatureRegion[];
    rivers: StoryRiver[];
    hills: StoryHill[];
    supernaturalElements: SupernaturalElement[];
    destructionEvents: DestructionEvent[];
    worldPaths: WorldPath[];
    localPaths: Record<string, LocalPath[]>;

    // Pre-built lookup maps
    locationById: Map<string, StoryLocation>;
    maxChapter: number;
}
