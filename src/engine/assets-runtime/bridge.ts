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

    drawLoadedAsset(ctx, loaded, x, y, size);
    return true;
}

/**
 * Draw a pre-loaded asset image centered on (x, y).
 * Scale preserves aspect ratio using the longer side as reference.
 */
function drawLoadedAsset(
    ctx: CanvasRenderingContext2D,
    loaded: LoadedAsset,
    x: number,
    y: number,
    size: number,
): void {
    const img = loaded.image;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw === 0 || ih === 0) return;

    // The 'size' is the target width in pixels. Scale height proportionally.
    const ratio = ih / iw;
    const drawW = size * 2; // the procedural draws are centered at ~size/2 to each side
    const drawH = drawW * ratio;

    // Images are drawn anchored at their bottom-center so mountains, trees
    // and houses all "stand on" the point (x, y) naturally
    ctx.drawImage(
        img,
        x - drawW / 2,
        y - drawH + drawH * 0.15, // small shift so the asset center matches the point
        drawW,
        drawH,
    );
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
