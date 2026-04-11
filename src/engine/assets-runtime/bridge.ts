/**
 * Asset bridge: sits between the generators and both asset sources
 * (PNG from IndexedDB or procedural from engine/assets).
 *
 * For each draw category (mountain, tree, house, ...) we expose a
 * function that first checks whether the AssetStore has a PNG for
 * the category, and if so draws it. Otherwise it calls the original
 * procedural function.
 *
 * This keeps the generators clean - they still call
 * drawMountainSmart() instead of drawMountain() and the bridge
 * decides at render time.
 */

import { getAssetStore } from './AssetStore';
import type { AssetCategory, LoadedAsset } from './types';
import {
    drawMountain,
    drawTree,
    drawHumanHouse,
    drawElvenHouse,
    drawDwarvenHouse,
    drawCastle,
    drawTower,
    drawTemple,
    drawVolcano,
    drawForge,
    drawChurch,
    drawShrine,
    drawTavern,
    drawWindmill,
} from '../assets';

/**
 * Per-category scale multiplier. The 'size' parameter coming from the
 * generators is calibrated for the small procedural icons (~12-24 px
 * diameter). Wonderdraft PNG assets are typically 128-512 px square
 * and look right on the map at roughly 2.5-4x the procedural draw
 * width, depending on how "anchored" the asset should be.
 *
 * Trees stay small (2.0x) so they don't dominate the map.
 * Mountains get 3.5x because they really need to read as terrain.
 * Cities/castles get 4.0x because they're landmarks.
 */
const CATEGORY_SCALE: Partial<Record<AssetCategory, number>> = {
    mountain: 3.5,
    hill: 3.0,
    plateau: 3.5,
    volcano: 3.8,
    tree: 2.0,
    pine: 2.0,
    forest: 3.2,
    field: 2.6,
    house: 2.4,
    house_human: 2.4,
    house_elven: 2.4,
    house_dwarven: 2.4,
    hut: 2.0,
    camp: 2.3,
    village: 3.0,
    city: 4.0,
    castle: 4.0,
    fortress: 4.0,
    tower: 2.8,
    lighthouse: 3.0,
    temple: 3.0,
    church: 3.0,
    shrine: 2.3,
    tavern: 2.5,
    forge: 2.5,
    windmill: 2.8,
    school: 3.0,
    river: 2.5,
    bridge: 2.5,
    ship: 2.8,
    airship: 3.2,
    ruins: 2.8,
    compass: 1.5,
    border: 1.5,
    cartouche: 1.5,
    decoration: 2.0,
};

/**
 * Bottom-anchor bias per category. 0.0 means the asset sits with its
 * center on (x,y); 1.0 means the asset's entire height extends above
 * (x,y). Most map stamps look right when anchored ~85% from the top
 * so the "base" of the building/tree sits on the point.
 */
const CATEGORY_ANCHOR_Y: Partial<Record<AssetCategory, number>> = {
    mountain: 0.82,
    hill: 0.80,
    plateau: 0.80,
    volcano: 0.85,
    tree: 0.85,
    pine: 0.85,
    forest: 0.70,
    field: 0.50,        // flat, drawn centered
    house: 0.80,
    house_human: 0.80,
    house_elven: 0.80,
    house_dwarven: 0.80,
    hut: 0.80,
    camp: 0.80,
    village: 0.75,
    city: 0.75,
    castle: 0.80,
    fortress: 0.80,
    tower: 0.85,
    lighthouse: 0.88,
    temple: 0.82,
    church: 0.85,
    shrine: 0.80,
    tavern: 0.80,
    forge: 0.80,
    windmill: 0.85,
    school: 0.82,
    river: 0.50,        // flat
    bridge: 0.50,
    ship: 0.60,
    airship: 0.50,
    ruins: 0.75,
    compass: 0.50,
    border: 0.50,
    cartouche: 0.50,
    decoration: 0.70,
};

/**
 * Draw an asset by category. If the AssetStore has at least one
 * variant, pick one deterministically via the seed and draw it
 * centered on (x, y) with the requested draw width. Returns true if
 * an asset was drawn, false if the caller should fall back.
 */
export function tryDrawAsset(
    ctx: CanvasRenderingContext2D,
    category: AssetCategory,
    x: number,
    y: number,
    size: number,
    seed: number,
): boolean {
    const store = getAssetStore();
    if (!store.hasCategory(category)) return false;

    const loaded = store.pickAsset(category, seed);
    if (!loaded) return false;

    drawLoadedAsset(ctx, loaded, x, y, size, category);
    return true;
}

/**
 * Draw a pre-loaded asset image at (x, y) with per-category scale
 * and anchor biases. Preserves aspect ratio.
 */
function drawLoadedAsset(
    ctx: CanvasRenderingContext2D,
    loaded: LoadedAsset,
    x: number,
    y: number,
    size: number,
    category: AssetCategory,
): void {
    const img = loaded.image;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw === 0 || ih === 0) return;

    // Target draw width = procedural size * category-specific multiplier
    const scale = CATEGORY_SCALE[category] ?? 2.5;
    const drawW = size * scale;
    // Preserve aspect ratio
    const ratio = ih / iw;
    const drawH = drawW * ratio;

    // Anchor: how far down inside the drawn rect the (x, y) point lands
    const anchor = CATEGORY_ANCHOR_Y[category] ?? 0.80;
    const topY = y - drawH * anchor;
    const leftX = x - drawW / 2;

    ctx.drawImage(img, leftX, topY, drawW, drawH);
}

// ── Smart wrappers per draw category ────────────────────────────────
// Each wrapper takes the same args as the procedural function, plus a
// 'seed' parameter for deterministic variant picking. If there are no
// loaded assets for the category, the wrapper forwards to the procedural
// function untouched.

type Ctx = CanvasRenderingContext2D;

export function drawMountainSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'mountain', x, y, size, seed)) return;
    drawMountain(ctx, x, y, size, options);
}

export function drawVolcanoSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'volcano', x, y, size, seed)) return;
    drawVolcano(ctx, x, y, size, options);
}

export function drawTreeSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    const type = options?.type;
    // Pine goes through the pine category first, fallback to generic tree
    if (type === 'pine' && tryDrawAsset(ctx, 'pine', x, y, size, seed)) return;
    if (tryDrawAsset(ctx, 'tree', x, y, size, seed)) return;
    drawTree(ctx, x, y, size, options);
}

export function drawHumanHouseSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'house_human', x, y, size, seed)) return;
    if (tryDrawAsset(ctx, 'house', x, y, size, seed)) return;
    drawHumanHouse(ctx, x, y, size, options);
}

export function drawElvenHouseSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'house_elven', x, y, size, seed)) return;
    if (tryDrawAsset(ctx, 'house', x, y, size, seed)) return;
    drawElvenHouse(ctx, x, y, size, options);
}

export function drawDwarvenHouseSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'house_dwarven', x, y, size, seed)) return;
    if (tryDrawAsset(ctx, 'house', x, y, size, seed)) return;
    drawDwarvenHouse(ctx, x, y, size, options);
}

export function drawCastleSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'castle', x, y, size, seed)) return;
    drawCastle(ctx, x, y, size);
}

export function drawTowerSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'tower', x, y, size, seed)) return;
    drawTower(ctx, x, y, size, options);
}

export function drawTempleSmart(ctx: Ctx, x: number, y: number, size: number, options: any = {}, seed = 0): void {
    if (tryDrawAsset(ctx, 'temple', x, y, size, seed)) return;
    drawTemple(ctx, x, y, size, options);
}

export function drawChurchSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'church', x, y, size, seed)) return;
    drawChurch(ctx, x, y, size);
}

export function drawShrineSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'shrine', x, y, size, seed)) return;
    drawShrine(ctx, x, y, size);
}

export function drawTavernSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'tavern', x, y, size, seed)) return;
    drawTavern(ctx, x, y, size);
}

export function drawForgeSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'forge', x, y, size, seed)) return;
    drawForge(ctx, x, y, size);
}

export function drawWindmillSmart(ctx: Ctx, x: number, y: number, size: number, seed = 0): void {
    if (tryDrawAsset(ctx, 'windmill', x, y, size, seed)) return;
    drawWindmill(ctx, x, y, size);
}
