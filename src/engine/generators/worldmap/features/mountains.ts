/**
 * Mountain rendering for the world map.
 *
 * Four placement strategies:
 *
 *   1. `renderMountainGrid` - Colored/Wonderdraft style, iterate a
 *      regular grid, drop a mountain icon where the heightmap is
 *      high enough. Grid spacing adapts to whether PNG assets are
 *      loaded (wider spacing when assets are large).
 *
 *   2. `renderBookMountainGrid` - Book style variant that uses the
 *      hand-drawn book asset instead of the regular icon. Fixed
 *      spacing because the book icons are small and consistent.
 *
 *   3. `renderMountainRidges` - Preferred method when the new
 *      terrain engine has detected explicit mountain ridge points.
 *      Renders one icon per ridge point so ranges read as chains.
 *
 *   4. `renderBookMountainRidges` - Book variant of the ridge renderer.
 *
 * The grid functions are fallbacks when the ridge detection doesn't
 * produce enough points; normally the orchestrator prefers ridges.
 *
 * All four are pure functions - they take (ctx, cfg, ...) explicitly
 * and don't touch any class state.
 */

import { drawMountainSmart, drawVolcanoSmart } from '../../../assets-runtime/bridge';
import { drawBookMountain } from '../../../bookstyle';
import { getAssetStore } from '../../../assets-runtime';

/** Subset of config that mountain renderers need. */
export interface MountainConfig {
    width: number;
    height: number;
    mountainLevel: number;
}

/** Minimal RNG shape. */
interface RngLike {
    next(): number;
    nextFloat(min: number, max: number): number;
}

/**
 * Single ridge point produced by `terrain.findMountainRidges`.
 * x,y are canvas coordinates; height is the normalised heightmap
 * value at that spot; size is the suggested draw width; isPeak is
 * true for local maxima within the ridge.
 */
export interface RidgePoint {
    x: number;
    y: number;
    height: number;
    size: number;
    isPeak: boolean;
}

/**
 * Render mountains on a regular grid - the colored/parchment/
 * wonderdraft styles use this.
 *
 * Grid spacing doubles when PNG assets are loaded, because the
 * asset stamps are much larger than the procedural icons and would
 * overlap heavily at the old 20px spacing.
 */
export function renderMountainGrid(
    ctx: CanvasRenderingContext2D,
    cfg: MountainConfig,
    heightMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, mountainLevel } = cfg;
    const store = getAssetStore();
    const hasMountainAssets = store.hasCategory('mountain');
    const spacing = hasMountainAssets ? 56 : 20;

    for (let y = spacing; y < height - spacing; y += spacing) {
        for (let x = spacing; x < width - spacing; x += spacing) {
            const h = heightMap[y * width + x];
            if (h < mountainLevel) continue;

            const offsetX = rng.nextFloat(-5, 5);
            const offsetY = rng.nextFloat(-5, 5);
            const size = 12 + (h - mountainLevel) * 40;

            // Position-derived variant seed so re-renders of the same
            // map pick the same asset variant at each grid cell
            const variantSeed = (x * 83492791) ^ (y * 12996221);

            // Small chance of volcano on the tallest cells
            if (h > mountainLevel + 0.15 && rng.next() > 0.92) {
                drawVolcanoSmart(ctx, x + offsetX, y + offsetY, size * 1.3, {}, variantSeed);
            } else {
                drawMountainSmart(ctx, x + offsetX, y + offsetY, size, { snow: h > 0.78 }, variantSeed);
            }
        }
    }
}

/**
 * Render mountains on a regular grid using the book-style asset.
 * Tighter spacing (18px) because the book icons are small hand-drawn
 * silhouettes rather than heavy PNGs.
 */
export function renderBookMountainGrid(
    ctx: CanvasRenderingContext2D,
    cfg: MountainConfig,
    heightMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, mountainLevel } = cfg;
    const spacing = 18;

    for (let y = spacing; y < height - spacing; y += spacing) {
        for (let x = spacing; x < width - spacing; x += spacing) {
            const h = heightMap[y * width + x];
            if (h < mountainLevel) continue;

            const offsetX = rng.nextFloat(-4, 4);
            const offsetY = rng.nextFloat(-4, 4);
            const size = 14 + (h - mountainLevel) * 50;

            drawBookMountain(ctx, x + offsetX, y + offsetY, size, {
                snow: h > 0.78,
            });
        }
    }
}

/**
 * Preferred renderer when the terrain engine provides explicit
 * ridge points. Each ridge point becomes a single mountain icon;
 * because ridges are naturally chained, the result reads as a
 * connected mountain range rather than scattered peaks.
 *
 * Also drops a volcano on the tallest ridge peaks with low
 * probability (~10%).
 */
export function renderMountainRidges(
    ctx: CanvasRenderingContext2D,
    cfg: Pick<MountainConfig, 'mountainLevel'>,
    ridgePoints: readonly RidgePoint[],
    rng: RngLike,
): void {
    for (const pt of ridgePoints) {
        const variantSeed = (Math.floor(pt.x) * 83492791) ^ (Math.floor(pt.y) * 12996221);
        if (pt.isPeak && pt.height > cfg.mountainLevel + 0.18 && rng.next() > 0.9) {
            drawVolcanoSmart(ctx, pt.x, pt.y, pt.size * 1.2, {}, variantSeed);
        } else {
            drawMountainSmart(ctx, pt.x, pt.y, pt.size, { snow: pt.height > 0.78 }, variantSeed);
        }
    }
}

/** Book-style variant of renderMountainRidges. */
export function renderBookMountainRidges(
    ctx: CanvasRenderingContext2D,
    _cfg: unknown,
    ridgePoints: readonly RidgePoint[],
    _rng: unknown,
): void {
    for (const pt of ridgePoints) {
        drawBookMountain(ctx, pt.x, pt.y, pt.size, { snow: pt.height > 0.78 });
    }
}
