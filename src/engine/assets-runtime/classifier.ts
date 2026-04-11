/**
 * Classify a filename into an AssetCategory.
 *
 * Supports multiple conventions so the user can drop in packs from
 * different sources without manual renaming:
 *
 * 1. Explicit prefix: "mountain_01.png", "tree_pine_03.png"
 * 2. Parent folder: "mountains/peak_01.png", "trees/oak.png"
 * 3. Keywords in the name: "snowy_peak.png" -> mountain,
 *    "tall_oak.png" -> tree, etc.
 *
 * Returns null if no category can be determined -- such assets are
 * imported as "decoration" so they still show up in the UI but don't
 * automatically replace procedural drawing.
 */

import type { AssetCategory } from './types';

/**
 * Keyword -> category lookup. Longer phrases checked first so "house_elven"
 * matches before "house".
 */
const KEYWORD_TO_CATEGORY: Array<[string, AssetCategory]> = [
    // Specific culture houses must come before generic 'house'
    ['house_elven', 'house_elven'],
    ['house_elf', 'house_elven'],
    ['elven_house', 'house_elven'],
    ['house_dwarven', 'house_dwarven'],
    ['house_dwarf', 'house_dwarven'],
    ['dwarven_house', 'house_dwarven'],
    ['house_human', 'house_human'],
    ['human_house', 'house_human'],

    // Specific tree types
    ['pine', 'pine'],
    ['conifer', 'pine'],
    ['fir', 'pine'],
    ['spruce', 'pine'],
    ['oak', 'tree'],
    ['deciduous', 'tree'],
    ['birch', 'tree'],
    ['tree', 'tree'],

    // Forest / woodland tiles (large masses)
    ['forest', 'forest'],
    ['woodland', 'forest'],
    ['grove', 'forest'],

    // Terrain - mountains
    ['mountain', 'mountain'],
    ['peak', 'mountain'],
    ['range', 'mountain'],
    ['cliff', 'mountain'],
    ['crag', 'mountain'],

    // Hills (a gentler category, separate from mountains)
    ['hill', 'hill'],
    ['rolling', 'hill'],

    // Volcanoes
    ['volcano', 'volcano'],
    ['volcanic', 'volcano'],

    // Structures
    ['castle', 'castle'],
    ['fortress', 'castle'],
    ['keep', 'castle'],
    ['stronghold', 'castle'],
    ['tower', 'tower'],
    ['watchtower', 'tower'],
    ['temple', 'temple'],
    ['church', 'church'],
    ['cathedral', 'church'],
    ['chapel', 'church'],
    ['shrine', 'shrine'],
    ['tavern', 'tavern'],
    ['inn', 'tavern'],
    ['forge', 'forge'],
    ['smithy', 'forge'],
    ['anvil', 'forge'],
    ['windmill', 'windmill'],
    ['mill', 'windmill'],

    // Generic house (after more specific matches)
    ['village', 'house'],
    ['cottage', 'house'],
    ['house', 'house'],
    ['building', 'house'],
    ['settlement', 'house'],

    // Water and paths
    ['river', 'river'],
    ['stream', 'river'],
    ['bridge', 'bridge'],

    // Decorations
    ['compass', 'compass'],
    ['rose', 'compass'],
    ['border', 'border'],
    ['frame', 'border'],
    ['cartouche', 'cartouche'],
    ['title', 'cartouche'],
];

const PARENT_FOLDER_MAP: Record<string, AssetCategory> = {
    mountains: 'mountain',
    hills: 'hill',
    trees: 'tree',
    pines: 'pine',
    forests: 'forest',
    forest: 'forest',
    houses: 'house',
    house_human: 'house_human',
    house_elven: 'house_elven',
    house_dwarven: 'house_dwarven',
    castles: 'castle',
    towers: 'tower',
    temples: 'temple',
    churches: 'church',
    shrines: 'shrine',
    taverns: 'tavern',
    forges: 'forge',
    windmills: 'windmill',
    volcanoes: 'volcano',
    rivers: 'river',
    bridges: 'bridge',
    decorations: 'decoration',
    compass: 'compass',
    borders: 'border',
    cartouches: 'cartouche',
};

/**
 * Extract a category from a filename (with optional folder path).
 *
 * @param path e.g. "mountains/peak_01.png" or "tree_pine_03.png"
 * @returns category or null if unknown
 */
export function classifyFilename(path: string): AssetCategory | null {
    // Normalize: forward slashes, lowercase, strip extension
    const normalized = path
        .replaceAll('\\', '/')
        .toLowerCase()
        .replace(/\.(png|jpg|jpeg|webp)$/i, '');

    // Split into folder parts and filename
    const parts = normalized.split('/').filter(p => p.length > 0);
    const filename = parts[parts.length - 1] ?? '';

    // 1. Check the immediate parent folder first
    if (parts.length >= 2) {
        const parent = parts[parts.length - 2];
        if (PARENT_FOLDER_MAP[parent]) {
            return PARENT_FOLDER_MAP[parent];
        }
    }

    // 2. Keyword match on filename (longest match first)
    // Sort by keyword length descending so "house_elven" beats "house"
    const sorted = [...KEYWORD_TO_CATEGORY].sort((a, b) => b[0].length - a[0].length);
    for (const [keyword, cat] of sorted) {
        if (filename.includes(keyword)) return cat;
    }

    // 3. Also check the full path keyword-wise (e.g. "Detailed-Mountains/peak01.png")
    for (const [keyword, cat] of sorted) {
        if (normalized.includes(keyword)) return cat;
    }

    return null;
}

/** Quick sanity test for the default conventions. */
export function selfTest(): boolean {
    const tests: Array<[string, AssetCategory | null]> = [
        ['mountain_01.png', 'mountain'],
        ['mountains/peak_42.png', 'mountain'],
        ['tree_pine_03.png', 'pine'],
        ['trees/oak_big.png', 'tree'],
        ['house_elven_02.png', 'house_elven'],
        ['houses/cottage.png', 'house'],
        ['castle_stone.png', 'castle'],
        ['Detailed-Mountains/rugged_crag.png', 'mountain'],
        ['random_noise_file.png', null],
    ];
    for (const [input, expected] of tests) {
        const got = classifyFilename(input);
        if (got !== expected) {
            console.warn(`classifier self-test failed: ${input} -> ${got} (expected ${expected})`);
            return false;
        }
    }
    return true;
}
