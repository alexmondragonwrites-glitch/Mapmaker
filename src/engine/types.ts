/**
 * Core types for the Calyndra Mapmaker generator system
 */

// ── Generator Control Types ─────────────────────────────────────────

export interface NumberControl {
  type: 'number';
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface RangeControl {
  type: 'range';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectControl {
  type: 'select';
  key: string;
  label: string;
  options: SelectOption[];
}

export interface CheckboxControl {
  type: 'checkbox';
  key: string;
  label: string;
}

export interface CustomControl {
  type: 'custom';
  key: string;
  label: string;
  renderer: string;
}

export type GeneratorControl =
  | NumberControl
  | RangeControl
  | SelectControl
  | CheckboxControl
  | CustomControl;

// ── Generator Interface ─────────────────────────────────────────────

export interface GeneratorConfig {
  seed: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface MapGenerator {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly defaultConfig: GeneratorConfig;

  getControls(): GeneratorControl[];
  generate(canvas: HTMLCanvasElement, config: GeneratorConfig): void;
}

// ── Registry Entry ──────────────────────────────────────────────────

export interface GeneratorEntry {
  id: string;
  label: string;
  icon: string;
  instance: MapGenerator;
  controls: GeneratorControl[];
}

// ── Enemy / Token Types ─────────────────────────────────────────────

export interface EnemyType {
  id: string;
  name: string;
  color: string;
  symbol: string;
  size: number;
}

// ── Lore Types ──────────────────────────────────────────────────────

export interface LoreRegion {
  id: string;
  name: string;
  description?: string;
  climate?: string;
  terrain?: string;
  relX: number;
  relY: number;
  relRadius: number;
}

export interface LoreCity {
  id: string;
  name: string;
  description?: string;
  size?: string;
  style?: string;
  isCapital?: boolean;
  hasWalls?: boolean;
  hasRiver?: boolean;
  hasCastle?: boolean;
  regionId?: string;
  relX?: number | null;
  relY?: number | null;
  population?: number;
  districts?: string[];
  landmarks?: string[];
  factionId?: string;
}

export interface LoreLandmark {
  id: string;
  name: string;
  type: string;
  description?: string;
  regionId?: string;
  relX?: number | null;
  relY?: number | null;
}

export interface LoreRiver {
  id: string;
  name: string;
  description?: string;
  startRegionId?: string;
  endRegionId?: string;
}

export interface LoreRoad {
  id: string;
  name: string;
  description?: string;
  fromCityId?: string;
  toCityId?: string;
}

export interface LoreFaction {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface LoreNPC {
  id: string;
  name: string;
  role?: string;
  description?: string;
  cityId?: string;
}

export interface LoreData {
  name: string;
  description: string;
  meta: {
    author: string;
    version: string;
    lastModified: string | null;
  };
  regions: LoreRegion[];
  cities: LoreCity[];
  landmarks: LoreLandmark[];
  rivers: LoreRiver[];
  roads: LoreRoad[];
  factions: LoreFaction[];
  npcs: LoreNPC[];
}

// ── World Map Hints (from Lore to Generator) ────────────────────────

export interface WorldMapHints {
  worldName: string;
  worldDescription: string;
  cities: LoreCity[];
  landmarks: LoreLandmark[];
  rivers: LoreRiver[];
  roads: LoreRoad[];
  regions: LoreRegion[];
}

export interface CityMapHints {
  name: string;
  size: string;
  style: string;
  hasWalls: boolean;
  hasRiver: boolean;
  hasCastle: boolean;
  description?: string;
  population?: number;
  districts: string[];
  landmarks: string[];
  npcs: LoreNPC[];
  faction: LoreFaction | null;
}

// ── Zoom Types ──────────────────────────────────────────────────────

export type ZoomLevel = 'world' | 'region' | 'city';

export interface ZoomTarget {
  level: ZoomLevel;
  data: {
    id?: string;
    name: string;
    seed?: number;
    size?: string;
    style?: string;
    isCapital?: boolean;
  };
}

export interface ClickableArea {
  shape: 'circle' | 'rect';
  x: number;
  y: number;
  radius?: number;
  width?: number;
  height?: number;
  label: string;
  targetLevel: ZoomLevel;
  targetData: ZoomTarget['data'];
  showIndicator?: boolean;
}
