/**
 * Terrain base-layer renderers for the world map, one per map style.
 *
 * Each `render*Style` function is called once per generate() with the
 * heightmap and moisture map already computed. It fills the canvas
 * with a fresh ImageData that represents the *base* look of the map
 * (water, land, coastlines) for a specific aesthetic:
 *
 *   - renderColoredStyle       saturated biome colours + hillshading
 *   - renderParchmentStyle     aged parchment with ink coastline
 *   - renderWonderdraftStyle   warm cream base for PNG asset packs
 *   - renderBookTerrainOverlay subtle biome tint on top of an
 *                              existing parchment texture (book style
 *                              draws its parchment base first, this
 *                              function adds colour modulation)
 *
 * These are pure functions: no dependency on `this`, no hidden state.
 * All inputs are passed explicitly as parameters so the orchestrator
 * in worldmap.ts can call whichever style matches the user's choice.
 */

import { PALETTES } from '../../../utils';
import { SimplexNoise } from '../../noise';
import {
    generateTemperatureMap,
    classifyBiome,
    getBiomeColor,
} from '../../terrain';

/**
 * Shape of the configuration object the world map generator uses.
 * Declared here as a local type so this module can be strict-clean
 * without importing from a larger types file.
 */
export interface WorldStyleConfig {
    width: number;
    height: number;
    seaLevel: number;
    mountainLevel: number;
    seed: number;
}

// Convert a #rrggbb string to [r, g, b] fast (no alpha, no parsing
// beyond substring + parseInt). Used by parchment and wonderdraft
// to blend palette colours per pixel.
function hexToRgbFast(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

/**
 * Draw a single-pixel contour line where the heightmap crosses
 * `level`. Used by parchment and Wonderdraft styles for their
 * coastline effects. The caller is expected to set `ctx.fillStyle`
 * before calling this function.
 */
export function drawContourLine(
    ctx: CanvasRenderingContext2D,
    cfg: WorldStyleConfig,
    heightMap: Float32Array,
    level: number,
): void {
    const { width, height } = cfg;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const h = heightMap[y * width + x];
            const hR = heightMap[y * width + x + 1];
            const hD = heightMap[(y + 1) * width + x];

            if (
                (h >= level && hR < level) || (h < level && hR >= level) ||
                (h >= level && hD < level) || (h < level && hD >= level)
            ) {
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
}

/**
 * Colored style: saturated biome colours with per-pixel micro-noise
 * variation to break up flat areas. Uses the temperature map so
 * biomes are latitude/altitude aware. Cache is passed in so the
 * orchestrator can reuse the temperature map across passes.
 */
export function renderColoredStyle(
    ctx: CanvasRenderingContext2D,
    cfg: WorldStyleConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
    temperatureMapCache: Float32Array | null,
): Float32Array {
    const { width, height, seaLevel, mountainLevel, seed } = cfg;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Reuse existing temperature map if the orchestrator has one,
    // otherwise build one here and return it so the caller can cache.
    const tempMap = temperatureMapCache
        ?? generateTemperatureMap(width, height, heightMap, seaLevel, seed);

    const microNoise = new SimplexNoise(seed + 9999);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const m = moistureMap[idx];
            const t = tempMap[idx];
            const pi = idx * 4;

            // Classify biome using temperature + moisture
            const biome = classifyBiome(h, m, t, seaLevel, mountainLevel);

            // Per-pixel micro-variation (prevents flat colour blocks)
            const microVal
                = microNoise.noise2D(x / 8, y / 8) * 0.5
                + microNoise.noise2D(x / 30, y / 30) * 0.3
                + microNoise.noise2D(x / 80, y / 80) * 0.2;

            const color = getBiomeColor(biome.biome, microVal);

            data[pi] = color.r;
            data[pi + 1] = color.g;
            data[pi + 2] = color.b;
            data[pi + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return tempMap;
}

/**
 * Parchment style: aged beige background with a dark ink coastline.
 * Water is a blue tint that deepens with depth. Land is shaded by
 * altitude so mountains read darker than lowlands.
 */
export function renderParchmentStyle(
    ctx: CanvasRenderingContext2D,
    cfg: WorldStyleConfig,
    heightMap: Float32Array,
): void {
    const { width, height, seaLevel } = cfg;
    const pal = PALETTES.parchment;

    // Fill canvas with parchment background first
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const waterRgb = hexToRgbFast(pal.water);
    const bgRgb = hexToRgbFast(pal.bg);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const pi = idx * 4;

            if (h < seaLevel) {
                // Water: blue tint layered on parchment
                const t = 0.3 + (seaLevel - h) * 0.5;
                data[pi]     = bgRgb[0] * (1 - t) + waterRgb[0] * t;
                data[pi + 1] = bgRgb[1] * (1 - t) + waterRgb[1] * t;
                data[pi + 2] = bgRgb[2] * (1 - t) + waterRgb[2] * t;
            } else {
                // Land: parchment with subtle elevation shading
                const shade = 1 - (h - seaLevel) * 0.15;
                data[pi]     = bgRgb[0] * shade;
                data[pi + 1] = bgRgb[1] * shade;
                data[pi + 2] = bgRgb[2] * shade;
            }
            data[pi + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    // Ink coastline along sea level
    ctx.fillStyle = 'rgba(42, 26, 10, 0.6)';
    drawContourLine(ctx, cfg, heightMap, seaLevel);
}

/**
 * Wonderdraft style: warm, muted base tuned so hand-drawn commercial
 * PNG asset packs (mountains, trees, cities) sit naturally on top.
 *
 * - Warm cream land base (not parchment brown) so assets pop
 * - Dusty teal water (not royal blue)
 * - Biome variation is deliberately muted so it doesn't fight the
 *   saturated asset stamps
 * - Coastline is a sand-coloured alpha halo, not a hard ink line
 */
export function renderWonderdraftStyle(
    ctx: CanvasRenderingContext2D,
    cfg: WorldStyleConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
): void {
    const { width, height, seaLevel, mountainLevel } = cfg;

    // Warm Wonderdraft-matching palette. Kept local to this function
    // because no other style uses it.
    const P = {
        deepWater:    [62, 104, 120],
        shallowWater: [108, 160, 172],
        sand:         [218, 200, 158],
        grass:        [186, 188, 122],
        forestHint:   [140, 158, 98],
        drylands:     [202, 184, 124],
        mountainHint: [168, 156, 128],
        snow:         [234, 230, 218],
    } as const;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const lerp3 = (
        a: readonly number[],
        b: readonly number[],
        t: number,
    ): [number, number, number] => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const m = moistureMap[idx];
            const pi = idx * 4;

            let rgb: [number, number, number];

            if (h < seaLevel) {
                // Water: interpolate by depth, from dusty teal to lighter teal
                const depth = (seaLevel - h) / seaLevel;
                const t = Math.max(0, Math.min(1, depth * 1.3));
                rgb = lerp3(P.shallowWater, P.deepWater, t);
            } else if (h < seaLevel + 0.03) {
                rgb = [P.sand[0], P.sand[1], P.sand[2]];
            } else if (h < mountainLevel) {
                // Land: blend by moisture, keep it muted
                const landT = (h - seaLevel) / (mountainLevel - seaLevel);
                if (m > 0.55) {
                    rgb = lerp3(P.grass, P.forestHint, Math.min(1, (m - 0.55) * 2));
                } else if (m > 0.25) {
                    rgb = [P.grass[0], P.grass[1], P.grass[2]];
                } else {
                    rgb = lerp3(P.grass, P.drylands, Math.min(1, (0.25 - m) * 2));
                }
                // Subtle elevation darkening - asset drop-shadows carry
                // the 3D feel from here on out
                const dim = 1 - landT * 0.08;
                rgb = [rgb[0] * dim, rgb[1] * dim, rgb[2] * dim];
            } else {
                // Mountains: warm stone, slightly lighter at peaks
                const peakT = Math.min(1, (h - mountainLevel) / 0.2);
                rgb = lerp3(P.mountainHint, P.snow, peakT * 0.5);
            }

            data[pi]     = Math.max(0, Math.min(255, rgb[0]));
            data[pi + 1] = Math.max(0, Math.min(255, rgb[1]));
            data[pi + 2] = Math.max(0, Math.min(255, rgb[2]));
            data[pi + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    // Soft sand-coloured coastline halo just above sea level
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgb(218, 200, 158)';
    drawContourLine(ctx, cfg, heightMap, seaLevel + 0.005);
    ctx.restore();
}

/**
 * Book style overlay: modulates an existing parchment-textured canvas
 * with subtle biome tints. Expects `renderParchmentTexture` to have
 * already been called so the canvas contains a paper-like base.
 *
 * This differs from `renderParchmentStyle` above: that one paints
 * from scratch with a flat palette, while this one reads back the
 * existing pixels (noise-based parchment) and multiplies in tints
 * so the paper grain shows through every biome.
 */
export function renderBookTerrainOverlay(
    ctx: CanvasRenderingContext2D,
    cfg: WorldStyleConfig,
    heightMap: Float32Array,
    moistureMap: Float32Array,
): void {
    const { width, height, seaLevel, mountainLevel } = cfg;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = heightMap[idx];
            const m = moistureMap[idx];
            const pi = idx * 4;

            if (h < seaLevel) {
                // Water: subtle blue-green tint on parchment
                const depth = (seaLevel - h) / seaLevel;
                const t = 0.15 + depth * 0.25;
                data[pi]     = Math.round(data[pi]     * (1 - t) + 90  * t);
                data[pi + 1] = Math.round(data[pi + 1] * (1 - t) + 120 * t);
                data[pi + 2] = Math.round(data[pi + 2] * (1 - t) + 150 * t);
            } else if (h < seaLevel + 0.03) {
                // Beach: slight golden push
                data[pi]     = Math.min(255, data[pi]     + 5);
                data[pi + 1] = Math.max(0,   data[pi + 1] - 5);
                data[pi + 2] = Math.max(0,   data[pi + 2] - 10);
            } else if (h < mountainLevel) {
                // Land: very subtle moisture-based tint
                const landH = (h - seaLevel) / (mountainLevel - seaLevel);
                if (m > 0.55) {
                    const t = 0.06 * (m - 0.55) * 4;
                    data[pi]     = Math.max(0, data[pi]     - data[pi]     * t * 0.3);
                    data[pi + 1] = Math.min(255, data[pi + 1] + 3);
                    data[pi + 2] = Math.max(0, data[pi + 2] - data[pi + 2] * t * 0.2);
                }
                // Slight darkening at higher elevations
                const altDarken = landH * 0.05;
                data[pi]     = Math.max(0, data[pi]     - data[pi]     * altDarken);
                data[pi + 1] = Math.max(0, data[pi + 1] - data[pi + 1] * altDarken);
                data[pi + 2] = Math.max(0, data[pi + 2] - data[pi + 2] * altDarken);
            } else {
                // Mountains: flat 12% darken
                const t = 0.12;
                data[pi]     = Math.max(0, data[pi]     - data[pi]     * t);
                data[pi + 1] = Math.max(0, data[pi + 1] - data[pi + 1] * t);
                data[pi + 2] = Math.max(0, data[pi + 2] - data[pi + 2] * t);
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}
