/**
 * Forest rendering for the world map.
 *
 * Four flavours with slightly different sampling strategies:
 *
 *   - renderForestGrid          Uniform grid, colored/parchment style.
 *                               Grid spacing adapts to loaded PNG
 *                               assets (12px procedural, 28px asset).
 *   - renderBookForestGrid      Same as above but draws with the
 *                               small hand-drawn book tree icon.
 *                               Kept as a legacy fallback.
 *   - renderNaturalForests      Poisson-disk sampling for natural
 *                               spacing. Tree type varies by
 *                               temperature map (cold -> pine,
 *                               hot -> deciduous, etc.).
 *   - renderBookNaturalForests  Book variant of the Poisson sampler.
 *
 * All four are pure functions over (ctx, cfg, heightMap, ...) - they
 * don't touch class state and they don't import from terrain.ts so
 * this file can eventually be added to tsconfig.strict.json once
 * the small subset of used helpers is also strict-clean.
 */

import { clamp } from '../../../../utils';
import { drawTreeSmart } from '../../../assets-runtime/bridge';
import { drawBookTree } from '../../../bookstyle';
import { getAssetStore } from '../../../assets-runtime';
import { poissonDiskSample } from '../../../terrain';

/** Subset of config fields the forest renderers consume. */
export interface ForestConfig {
    width: number;
    height: number;
    seaLevel: number;
    mountainLevel: number;
    forestDensity: number;
}

/** Minimal seeded RNG interface. */
interface RngLike {
    next(): number;
    nextFloat(min: number, max: number): number;
}

/**
 * Grid-sampled forest renderer for colored/parchment/wonderdraft
 * styles. Walks a regular grid and drops a tree at cells whose
 * heightmap + moisture values pass the forest threshold.
 *
 * Spacing automatically widens from 12px to 28px when PNG tree
 * assets are loaded, because the asset stamps are ~3x larger than
 * the procedural icons.
 */
export function renderForestGrid(
    ctx: CanvasRenderingContext2D,
    cfg: ForestConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;

    const store = getAssetStore();
    const hasTreeAssets = store.hasCategory('tree') || store.hasCategory('pine');
    const treeSpacing = hasTreeAssets ? 28 : 12;

    for (let y = treeSpacing; y < height - treeSpacing; y += treeSpacing) {
        for (let x = treeSpacing; x < width - treeSpacing; x += treeSpacing) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const m = moistureMap[idx];

            if (h <= seaLevel || h >= mountainLevel * 0.9) continue;
            if (m < 0.45) continue;

            const forestChance = (m - 0.45) * 2 * forestDensity;
            if (rng.next() > forestChance) continue;

            const offsetX = rng.nextFloat(-4, 4);
            const offsetY = rng.nextFloat(-4, 4);
            const size = rng.nextFloat(6, 10);
            const type = rng.next() > 0.4 ? 'deciduous' : 'pine';

            // Position-derived variant seed so the same cell always
            // picks the same tree variant across re-renders
            const variantSeed = (x * 73856093) ^ (y * 19349663);
            drawTreeSmart(ctx, x + offsetX, y + offsetY, size, { type }, variantSeed);
        }
    }
}

/**
 * Grid-sampled forest renderer for the book style. Uses the small
 * hand-drawn book tree icon and a tighter 10px spacing because
 * book icons are smaller than the PNG stamps.
 *
 * Kept as a legacy fallback; the preferred book renderer is
 * `renderBookNaturalForests` below which uses Poisson disk sampling.
 */
export function renderBookForestGrid(
    ctx: CanvasRenderingContext2D,
    cfg: ForestConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;
    const treeSpacing = 10;

    for (let y = treeSpacing; y < height - treeSpacing; y += treeSpacing) {
        for (let x = treeSpacing; x < width - treeSpacing; x += treeSpacing) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const m = moistureMap[idx];

            if (h <= seaLevel || h >= mountainLevel * 0.9) continue;
            if (m < 0.45) continue;

            const forestChance = (m - 0.45) * 2 * forestDensity;
            if (rng.next() > forestChance) continue;

            const offsetX = rng.nextFloat(-3, 3);
            const offsetY = rng.nextFloat(-3, 3);
            const size = rng.nextFloat(5, 8);
            const type = rng.next() > 0.4 ? 'deciduous' : 'pine';

            drawBookTree(ctx, x + offsetX, y + offsetY, size, { type });
        }
    }
}

/**
 * Natural forest renderer using Poisson disk sampling. Produces
 * evenly-distributed tree positions without grid artefacts, then
 * filters them through the heightmap/moisture/temperature rules.
 *
 * Temperature influence:
 *   - t < 0.25 (cold)     -> always pine (conifer forests)
 *   - t > 0.7 (tropical)  -> deciduous, but sparse
 *   - otherwise           -> mixed, pine:deciduous ~ 35:65
 *
 * Min distance between trees scales inversely with forestDensity:
 * denser config = tighter packing.
 */
export function renderNaturalForests(
    ctx: CanvasRenderingContext2D,
    cfg: ForestConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
    temperatureMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;

    const minDist = Math.max(8, 16 - forestDensity * 8);
    const treePoints = poissonDiskSample(width, height, minDist, rng);

    for (const pt of treePoints) {
        const ix = clamp(Math.floor(pt.x), 0, width - 1);
        const iy = clamp(Math.floor(pt.y), 0, height - 1);
        const idx = iy * width + ix;

        const h = heightMap[idx];
        const m = moistureMap[idx];
        const t = temperatureMap[idx];

        // Only draw on land, not on water or high mountains
        if (h <= seaLevel || h >= mountainLevel * 0.88) continue;

        // Moisture threshold with smooth probability falloff
        if (m < 0.35) continue;
        const forestChance = (m - 0.35) * 2.5 * forestDensity;
        if (rng.next() > forestChance) continue;

        // Tree type depends on temperature band
        let type: 'pine' | 'deciduous';
        if (t < 0.25) {
            type = 'pine';
        } else if (t > 0.7) {
            type = 'deciduous';
            // Savannas are sparse - skip half of candidates
            if (rng.next() > 0.5) continue;
        } else {
            type = rng.next() > 0.35 ? 'deciduous' : 'pine';
        }

        const size = rng.nextFloat(5, 9);
        const variantSeed = (Math.floor(pt.x) * 73856093) ^ (Math.floor(pt.y) * 19349663);
        drawTreeSmart(ctx, pt.x, pt.y, size, { type }, variantSeed);
    }
}

/**
 * Book-style variant of `renderNaturalForests`. Same algorithm but
 * uses the hand-drawn book tree icon and slightly denser sampling
 * (minDist = max(7, 14 - density*7) vs max(8, 16 - density*8)).
 * Moisture threshold is also a touch lower (0.35 is the same).
 */
export function renderBookNaturalForests(
    ctx: CanvasRenderingContext2D,
    cfg: ForestConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
    temperatureMap: Float32Array,
    rng: RngLike,
): void {
    const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;

    const minDist = Math.max(7, 14 - forestDensity * 7);
    const treePoints = poissonDiskSample(width, height, minDist, rng);

    for (const pt of treePoints) {
        const ix = clamp(Math.floor(pt.x), 0, width - 1);
        const iy = clamp(Math.floor(pt.y), 0, height - 1);
        const idx = iy * width + ix;

        const h = heightMap[idx];
        const m = moistureMap[idx];
        const t = temperatureMap[idx];

        if (h <= seaLevel || h >= mountainLevel * 0.88) continue;
        if (m < 0.35) continue;
        const forestChance = (m - 0.35) * 2.5 * forestDensity;
        if (rng.next() > forestChance) continue;

        const type = t < 0.25
            ? 'pine'
            : rng.next() > 0.35 ? 'deciduous' : 'pine';
        const size = rng.nextFloat(4, 7);
        drawBookTree(ctx, pt.x, pt.y, size, { type });
    }
}
