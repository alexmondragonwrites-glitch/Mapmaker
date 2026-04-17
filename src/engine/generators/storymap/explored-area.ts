/**
 * Explored-area mask for the Story Map.
 *
 * The world is much larger than what the heroes have actually
 * mapped. Rather than render the full canvas with fog patches over
 * unexplored locations, we invert the logic: only the EXPLORED
 * area gets full terrain rendering, everything else is Terra
 * Incognita (dark, sketchy, suggestive).
 *
 * The explored mask is built per chapter from:
 *   - Circles around visible locations (radius depends on type)
 *   - Corridors along visible paths (if user has traveled them)
 *   - Soft noise-edged boundary so it doesn't look like a hard
 *     stencil cut-out
 */

import { SimplexNoise } from '../../noise';
import { parseSVGPath, scaleCoord, drawPointPath } from './svg-path';
import { getVisibleLocations } from './data-loader';
import type { StoryWorldData, StoryLocation, Point } from './types';

/** Dynamic viewport rect — passed through from the world renderer. */
interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Map a world coordinate to canvas pixel via the viewport. */
function viewToCanvas(
    wx: number, wy: number,
    view: ViewRect, canvasW: number, canvasH: number,
): Point {
    return {
        x: ((wx - view.x) / view.w) * canvasW,
        y: ((wy - view.y) / view.h) * canvasH,
    };
}

/** Scale a set of world-coord points to canvas pixels. */
function viewPointsToCanvas(
    points: readonly Point[], view: ViewRect, canvasW: number, canvasH: number,
): Point[] {
    return points.map(p => viewToCanvas(p.x, p.y, view, canvasW, canvasH));
}

/** Exploration radius around each location type, in view coords. */
const EXPLORATION_RADIUS: Record<string, number> = {
    village: 140,
    farm: 90,
    water: 60,
    landmark: 55,
    hollow: 50,
    shelter: 70,
    cabin: 90,
    darkwood: 40,
};

/** Corridor half-width along paths between explored locations. */
const PATH_CORRIDOR = 35;

/**
 * Build a mask canvas where white pixels = explored, black = unknown.
 * Returns an offscreen canvas the same size as the main canvas.
 *
 * Uses soft radial gradients so edges fade smoothly — no hard
 * stencil boundary.
 */
export function buildExploredMask(
    data: StoryWorldData,
    chapter: number,
    view: ViewRect,
    width: number,
    height: number,
    radiusMultiplier = 1,
): HTMLCanvasElement {
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const ctx = mask.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';

    const visibleLocations = getVisibleLocations(data, chapter);
    const visibleIds = new Set(visibleLocations.map(l => l.id));

    // 1. Paint location circles
    for (const loc of visibleLocations) {
        const p = viewToCanvas(
            loc.coordinates.x, loc.coordinates.y,
            view, width, height,
        );
        const baseRadius = EXPLORATION_RADIUS[loc.type] ?? 60;
        const viewRadius = baseRadius * radiusMultiplier;
        const pxRadius = (viewRadius / view.w) * width;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pxRadius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.65, '#808080');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pxRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2. Paint path corridors between visible locations
    const corridorPx = (PATH_CORRIDOR / view.w) * width * radiusMultiplier;
    for (const path of data.worldPaths) {
        if (!visibleIds.has(path.from) || !visibleIds.has(path.to)) continue;

        const points = parseSVGPath(path.svgPath);
        const scaled = viewPointsToCanvas(points, view, width, height);
        if (scaled.length < 2) continue;

        // Draw a wide soft stroke along the path
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer soft glow (fades to black)
        ctx.strokeStyle = 'rgba(70, 70, 70, 1)';
        ctx.lineWidth = corridorPx * 2.2;
        drawPointPath(ctx, scaled);
        ctx.stroke();

        // Inner solid corridor
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = corridorPx;
        drawPointPath(ctx, scaled);
        ctx.stroke();

        ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';

    // 3. Noise-based edge dithering — break the perfect circles
    applyNoiseEdge(ctx, width, height);

    return mask;
}

/**
 * Applies a noise dither to the mask so edges look organic/hand-drawn.
 * Reads the current mask, perturbs gray-band pixels based on noise.
 */
function applyNoiseEdge(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    const noise = new SimplexNoise(777);
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const v = d[i]; // red channel (mask is gray)
            // Only perturb in the transition band
            if (v > 20 && v < 235) {
                const n = noise.noise2D(x / 12, y / 12);
                const shift = n * 60;
                const newV = Math.max(0, Math.min(255, v + shift));
                d[i] = newV;
                d[i + 1] = newV;
                d[i + 2] = newV;
            }
        }
    }

    ctx.putImageData(img, 0, 0);
}

/**
 * Apply the mask to a destination canvas context so only explored
 * pixels show. Uses the red channel of the mask as alpha.
 */
export function applyMaskAsAlpha(
    destCtx: CanvasRenderingContext2D,
    mask: HTMLCanvasElement,
) {
    // destination-in: keep only pixels where mask has alpha (we use
    // the mask as an alpha source via a tmp canvas)
    destCtx.save();
    destCtx.globalCompositeOperation = 'destination-in';
    destCtx.drawImage(mask, 0, 0);
    destCtx.restore();
}

/**
 * Trace the approximate boundary of the explored region for drawing
 * a decorative edge. Returns an array of edge pixels that we can
 * stylize with ink strokes / hachure.
 */
export function findMaskEdge(
    mask: HTMLCanvasElement,
    step = 4,
): Point[] {
    const w = mask.width;
    const h = mask.height;
    const ctx = mask.getContext('2d')!;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const edge: Point[] = [];

    // Simple threshold edge detection
    for (let y = step; y < h - step; y += step) {
        for (let x = step; x < w - step; x += step) {
            const idx = (y * w + x) * 4;
            const v = d[idx];
            // Look for pixels in the edge transition band
            if (v > 60 && v < 180) {
                edge.push({ x, y });
            }
        }
    }

    return edge;
}
