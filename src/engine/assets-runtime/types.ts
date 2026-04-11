/**
 * Runtime asset types. Separate file from engine/types.ts so imports
 * stay focused and the asset system can evolve independently.
 */

/** Known asset categories. Generators can request these. */
export type AssetCategory =
    | 'mountain'
    | 'hill'
    | 'plateau'
    | 'tree'
    | 'pine'
    | 'forest'
    | 'house'
    | 'house_human'
    | 'house_elven'
    | 'house_dwarven'
    | 'hut'
    | 'camp'
    | 'village'
    | 'city'
    | 'castle'
    | 'fortress'
    | 'tower'
    | 'lighthouse'
    | 'temple'
    | 'church'
    | 'shrine'
    | 'tavern'
    | 'forge'
    | 'windmill'
    | 'school'
    | 'volcano'
    | 'river'
    | 'bridge'
    | 'ship'
    | 'airship'
    | 'ruins'
    | 'field'
    | 'compass'
    | 'border'
    | 'cartouche'
    | 'decoration';

/** Stored asset record in IndexedDB. */
export interface AssetRecord {
    /** Unique ID (filename without extension, prefixed by pack id). */
    id: string;
    /** The pack this asset belongs to. */
    packId: string;
    /** Classification category (mountain, tree, etc.). */
    category: AssetCategory;
    /** Original filename for display. */
    filename: string;
    /** Raw PNG bytes as Blob. */
    blob: Blob;
    /** Width / height in pixels, after loading (populated lazily). */
    width?: number;
    height?: number;
    /** Insert timestamp (ms since epoch). */
    addedAt: number;
}

/** Pack metadata. */
export interface PackRecord {
    id: string;
    name: string;
    description?: string;
    /** Timestamp when this pack was imported. */
    addedAt: number;
    /** Optional license note the user wants to remember. */
    license?: string;
    /** Enabled = generators use assets from this pack. */
    enabled: boolean;
    /** Number of assets in this pack (cached for UI). */
    assetCount: number;
}

/** A runtime-loaded asset ready for drawing on canvas. */
export interface LoadedAsset {
    record: AssetRecord;
    image: HTMLImageElement;
}
