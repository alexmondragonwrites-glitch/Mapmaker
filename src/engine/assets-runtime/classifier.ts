/**
 * Classify a filename into an AssetCategory.
 *
 * Supports multiple conventions so the user can drop in packs from
 * different sources without manual renaming:
 *
 * 1. Folder-anywhere match: "Mazenc/sprites/mountains/peak_01.png"
 *    -> matches on "mountains" regardless of how deep it sits
 * 2. Explicit prefix: "mountain_01.png", "tree_pine_03.png"
 * 3. Keywords anywhere in the path: "snowy_peak.png" -> mountain
 *
 * Returns null if no category can be determined.
 *
 * This classifier is optimised for Wonderdraft-style packs where
 * assets typically sit under a triple-nested path like
 *   <pack_name>/sprites/<category>/<asset>.png
 * so we need to look up the whole path for a folder keyword, not
 * just the immediate parent.
 */

import type { AssetCategory } from './types';

/**
 * Map folder name -> category. Any folder segment in the path will be
 * checked against this map; first longest match wins.
 * Keys are lowercase, singular and plural both listed where relevant.
 *
 * Wonderdraft packs commonly use these top-level folder names, mined
 * from the user's 1281-file dump:
 *   Animals, Beasts, Beats, Castle, Fantasy, Fortress, M, Mazenc, Pat,
 *   Rings, Temple, Trees, Tribe, Wizards, World, airships, assets,
 *   bridge, camp, cartouches, castle, church, cities, city, cornfields,
 *   creator, domain, forest, fort, fortress, hills, house, hut, inspired,
 *   lighthouse, magic, mountains, new, normal, pack, plateaus, ranges,
 *   sample, school, settlements, ship, structure, temple, themes,
 *   thieves, tower, town, traps, trees, village, war, windmill
 */
const FOLDER_TO_CATEGORY: Record<string, AssetCategory> = {
    // Terrain
    mountain: 'mountain',
    mountains: 'mountain',
    peak: 'mountain',
    peaks: 'mountain',
    range: 'mountain',
    ranges: 'mountain',
    hill: 'hill',
    hills: 'hill',
    plateau: 'plateau',
    plateaus: 'plateau',
    volcano: 'volcano',
    volcanoes: 'volcano',

    // Vegetation
    tree: 'tree',
    trees: 'tree',
    pine: 'pine',
    pines: 'pine',
    conifers: 'pine',
    forest: 'forest',
    forests: 'forest',
    woodland: 'forest',
    woods: 'forest',
    grove: 'forest',
    groves: 'forest',
    cornfields: 'field',
    fields: 'field',

    // Settlements and structures
    house: 'house',
    houses: 'house',
    home: 'house',
    homes: 'house',
    cottage: 'house',
    cottages: 'house',
    building: 'house',
    buildings: 'house',
    structure: 'house',
    structures: 'house',
    hut: 'hut',
    huts: 'hut',
    tribe: 'hut',
    settlement: 'village',
    settlements: 'village',
    village: 'village',
    villages: 'village',
    town: 'village',
    towns: 'village',
    city: 'city',
    cities: 'city',
    camp: 'camp',
    camps: 'camp',

    // Fortifications
    castle: 'castle',
    castles: 'castle',
    keep: 'castle',
    stronghold: 'castle',
    fort: 'fortress',
    forts: 'fortress',
    fortress: 'fortress',
    fortresses: 'fortress',
    tower: 'tower',
    towers: 'tower',
    watchtower: 'tower',
    watchtowers: 'tower',
    lighthouse: 'lighthouse',
    lighthouses: 'lighthouse',

    // Religious
    temple: 'temple',
    temples: 'temple',
    church: 'church',
    churches: 'church',
    cathedral: 'church',
    chapel: 'church',
    shrine: 'shrine',
    shrines: 'shrine',

    // Specialty buildings
    tavern: 'tavern',
    taverns: 'tavern',
    inn: 'tavern',
    inns: 'tavern',
    forge: 'forge',
    forges: 'forge',
    smithy: 'forge',
    windmill: 'windmill',
    windmills: 'windmill',
    mill: 'windmill',
    mills: 'windmill',
    school: 'school',
    schools: 'school',
    academy: 'school',

    // Water and paths
    river: 'river',
    rivers: 'river',
    stream: 'river',
    streams: 'river',
    bridge: 'bridge',
    bridges: 'bridge',
    ship: 'ship',
    ships: 'ship',
    boats: 'ship',
    airship: 'airship',
    airships: 'airship',

    // Ruins and traps
    ruin: 'ruins',
    ruins: 'ruins',
    traps: 'ruins',
    thieves: 'ruins',

    // Decorations
    decoration: 'decoration',
    decorations: 'decoration',
    compass: 'compass',
    compasses: 'compass',
    border: 'border',
    borders: 'border',
    frame: 'border',
    frames: 'border',
    cartouche: 'cartouche',
    cartouches: 'cartouche',

    // Categories that are too generic to classify specifically - fall through
    // to keyword matching or get dropped as unknown
    // assets, pack, inspired, Mazenc, Pat, M, new, normal, sample,
    // themes, creator, domain, magic, war, fantasy - all skipped
};

/**
 * Keyword -> category lookup for filename-level matching.
 * Longer phrases come first so "house_elven" matches before "house".
 */
const KEYWORD_TO_CATEGORY: Array<[string, AssetCategory]> = [
    // Specific culture houses must come before generic 'house'
    ['house_elven', 'house_elven'],
    ['house_elf', 'house_elven'],
    ['elven_house', 'house_elven'],
    ['elven', 'house_elven'],
    ['elf_', 'house_elven'],
    ['house_dwarven', 'house_dwarven'],
    ['house_dwarf', 'house_dwarven'],
    ['dwarven_house', 'house_dwarven'],
    ['dwarven', 'house_dwarven'],
    ['dwarf_', 'house_dwarven'],
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
    ['cliff', 'mountain'],
    ['crag', 'mountain'],
    ['rugged', 'mountain'],

    // Hills (separate from mountains)
    ['hill', 'hill'],
    ['rolling', 'hill'],
    ['plateau', 'plateau'],

    // Volcanoes
    ['volcano', 'volcano'],
    ['volcanic', 'volcano'],

    // Specialty structures
    ['lighthouse', 'lighthouse'],
    ['castle', 'castle'],
    ['fortress', 'fortress'],
    ['fort_', 'fortress'],
    ['keep', 'castle'],
    ['stronghold', 'castle'],
    ['watchtower', 'tower'],
    ['tower', 'tower'],
    ['cathedral', 'church'],
    ['church', 'church'],
    ['chapel', 'church'],
    ['temple', 'temple'],
    ['shrine', 'shrine'],
    ['tavern', 'tavern'],
    ['inn_', 'tavern'],
    ['forge', 'forge'],
    ['smithy', 'forge'],
    ['anvil', 'forge'],
    ['windmill', 'windmill'],
    ['school', 'school'],
    ['academy', 'school'],
    ['library', 'school'],

    // Settlements
    ['village', 'village'],
    ['settlement', 'village'],
    ['town', 'village'],
    ['city', 'city'],
    ['camp', 'camp'],
    ['tent', 'camp'],
    ['hut', 'hut'],

    // Generic house (after more specific matches)
    ['cottage', 'house'],
    ['house', 'house'],
    ['building', 'house'],

    // Water and transport
    ['river', 'river'],
    ['stream', 'river'],
    ['bridge', 'bridge'],
    ['airship', 'airship'],
    ['zeppelin', 'airship'],
    ['ship', 'ship'],
    ['boat', 'ship'],

    // Ruins
    ['ruin', 'ruins'],
    ['crumble', 'ruins'],
    ['broken', 'ruins'],

    // Fields
    ['cornfield', 'field'],
    ['field', 'field'],
    ['farmland', 'field'],

    // Decorations
    ['compass', 'compass'],
    ['rose', 'compass'],
    ['border', 'border'],
    ['frame', 'border'],
    ['cartouche', 'cartouche'],
    ['scroll', 'cartouche'],
    ['title', 'cartouche'],
];

/** Folder segments that exist in Wonderdraft paths but are NOT categories. */
const FOLDER_NOISE = new Set([
    'sprites', 'symbols', 'textures', 'fonts', 'ground', 'water',
    'paper', 'overlays', 'themes', 'theme', 'creator', 'sample',
    'samples', 'normal', 'custom', 'new', 'magic', 'pat', 'pack',
    'packs', 'assets', 'asset', 'inspired', 'mazenc', 'fantasy',
    'world', 'domain', 'war', 'rings', 'wizards', 'beats', 'beasts',
    'animals', 'animal',
]);

/**
 * Extract a category from a filename (with optional folder path).
 *
 * @param path e.g. "Mazenc/sprites/mountains/peak_01.png"
 *                  or "tree_pine_03.png"
 * @returns category or null if unknown
 */
export function classifyFilename(path: string): AssetCategory | null {
    // Normalize: forward slashes, lowercase, strip extension
    const normalized = path
        .replaceAll('\\', '/')
        .toLowerCase()
        .replace(/\.(png|jpg|jpeg|webp)$/i, '');

    const parts = normalized.split('/').filter(p => p.length > 0);
    const filename = parts[parts.length - 1] ?? '';

    // Pass 1: walk the folder segments from closest-to-file outward.
    // This means if the path is "Mazenc/sprites/mountains/peak_01", we
    // check "mountains" first, then "sprites", then "Mazenc". The first
    // segment that maps to a real category wins.
    for (let i = parts.length - 2; i >= 0; i--) {
        const seg = parts[i];
        if (FOLDER_NOISE.has(seg)) continue;
        if (FOLDER_TO_CATEGORY[seg]) {
            return FOLDER_TO_CATEGORY[seg];
        }
    }

    // Pass 2: keyword match on filename (longest match wins).
    // Sort by keyword length descending so "house_elven" beats "house".
    const sorted = [...KEYWORD_TO_CATEGORY].sort((a, b) => b[0].length - a[0].length);
    for (const [keyword, cat] of sorted) {
        if (filename.includes(keyword)) return cat;
    }

    // Pass 3: keyword match anywhere in the path (fallback for weird packs)
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
        ['Mazenc/sprites/mountains/peak_01.png', 'mountain'],
        ['inspired/sprites/mountains/rugged_01.png', 'mountain'],
        ['tree_pine_03.png', 'pine'],
        ['trees/oak_big.png', 'tree'],
        ['Pat/sprites/trees/fir_01.png', 'pine'],
        ['house_elven_02.png', 'house_elven'],
        ['houses/cottage.png', 'house'],
        ['castle_stone.png', 'castle'],
        ['fortress/big_fort.png', 'fortress'],
        ['lighthouse/coast_01.png', 'lighthouse'],
        ['plateaus/rocky.png', 'plateau'],
        ['camp/tent_01.png', 'camp'],
        ['hut/tribal.png', 'hut'],
        ['windmill/old.png', 'windmill'],
        ['ship/galleon.png', 'ship'],
        ['airships/small.png', 'airship'],
        ['random_noise_file.png', null],
    ];
    let ok = true;
    for (const [input, expected] of tests) {
        const got = classifyFilename(input);
        if (got !== expected) {
            console.warn(`classifier self-test failed: ${input} -> ${got} (expected ${expected})`);
            ok = false;
        }
    }
    return ok;
}
