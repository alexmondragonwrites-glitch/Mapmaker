/**
 * River generation and rendering for the world map.
 *
 * Two systems coexist:
 *
 *   1. `generateSimpleRivers` / `renderSimpleRivers`
 *      The original algorithm: pick N starting points near the
 *      mountain tops and walk downhill with a small randomness
 *      bonus to break ties. Produces a list of polylines, one
 *      per river. Fast, deterministic, good for the colored and
 *      parchment styles.
 *
 *   2. `renderRiverSystems`
 *      Renders the "drainage basin" river systems produced by
 *      `generateRiverSystems` in terrain.ts. Those rivers carry
 *      a `width` per point so the river visibly grows as it flows
 *      downstream.
 *
 * Both functions are pure: no class state, no side effects on
 * anything except the canvas passed in as `ctx`.
 */

import { PALETTES } from '../../../../utils';
import { drawRiver } from '../../../assets';

/** Subset of the world map config that the river functions care about. */
export interface RiverConfig {
    width: number;
    height: number;
    seaLevel: number;
    mountainLevel: number;
    riverCount: number;
    mapStyle: string;
}

/** A single river as a list of points, youngest upstream to oldest downstream. */
export type SimpleRiver = Array<{ x: number; y: number }>;

/** Minimal RNG shape we need (matches SeededRandom in utils). */
interface RngLike {
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
}

/**
 * Generate `riverCount` downhill-flowing rivers.
 *
 * Algorithm:
 *   1. Pick a random (x, y) whose heightmap value is high enough to
 *      be near a mountain peak.
 *   2. Greedy-walk downhill by checking a 7x7 neighbourhood for the
 *      lowest cell, with a tiny random nudge so perfectly flat slopes
 *      still break ties.
 *   3. Stop when we drop below sea level or when the walk gets stuck
 *      (no neighbour is lower).
 *   4. Sample the path every 3 steps so later rendering can draw a
 *      smoother curve without storing every cell.
 *
 * Rivers with fewer than 6 sampled points are discarded because they
 * look like stubs on the finished map.
 *
 * @returns An array of rivers. Each river is an array of {x, y} points
 *          ordered from source to mouth.
 */
export function generateSimpleRivers(
    cfg: RiverConfig,
    heightMap: Float32Array,
    rng: RngLike,
): SimpleRiver[] {
    const { width, height, seaLevel, mountainLevel, riverCount } = cfg;
    const rivers: SimpleRiver[] = [];

    for (let r = 0; r < riverCount; r++) {
        let attempts = 0;
        let startX = 0;
        let startY = 0;

        // Find a spot near the top of a mountain
        do {
            startX = rng.nextInt(Math.floor(width * 0.1), Math.floor(width * 0.9));
            startY = rng.nextInt(Math.floor(height * 0.1), Math.floor(height * 0.9));
            attempts++;
        } while (
            heightMap[startY * width + startX] < mountainLevel * 0.85 &&
            attempts < 200
        );

        if (attempts >= 200) continue;

        const points: SimpleRiver = [{ x: startX, y: startY }];
        let cx = startX;
        let cy = startY;

        for (let step = 0; step < 500; step++) {
            const currentH = heightMap[Math.floor(cy) * width + Math.floor(cx)];
            if (currentH < seaLevel) break;

            let bestX = cx;
            let bestY = cy;
            let bestH = currentH;

            // Check a 7x7 neighbourhood for the lowest cell
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = Math.floor(cx + dx);
                    const ny = Math.floor(cy + dy);
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    // Small random bonus so perfectly flat pairs have
                    // a deterministic-but-not-grid-aligned winner
                    const nh = heightMap[ny * width + nx] + rng.nextFloat(0, 0.005);
                    if (nh < bestH) {
                        bestH = nh;
                        bestX = nx;
                        bestY = ny;
                    }
                }
            }

            if (bestX === cx && bestY === cy) break;  // stuck
            cx = bestX;
            cy = bestY;

            // Subsample so the path isn't denser than the render needs
            if (step % 3 === 0) {
                points.push({ x: cx, y: cy });
            }
        }

        if (points.length > 5) rivers.push(points);
    }

    return rivers;
}

/**
 * Pick the stroke colour for rivers based on the current map style.
 * Exported so the lore-river renderer can match.
 */
export function riverColorForStyle(style: string): string {
    if (style === 'book') return 'rgba(40, 65, 105, 0.7)';
    if (style === 'parchment') return PALETTES.parchment.water;
    return '#4a90c4';
}

/**
 * Draw simple rivers with growing width from source to mouth.
 * Uses the existing `drawRiver` asset helper one segment at a time
 * so the width can taper over the length.
 */
export function renderSimpleRivers(
    ctx: CanvasRenderingContext2D,
    rivers: readonly SimpleRiver[],
    style: string,
): void {
    const color = riverColorForStyle(style);

    for (const river of rivers) {
        for (let i = 0; i < river.length - 1; i++) {
            const t = i / river.length;
            const strokeWidth = 1 + t * 3;
            drawRiver(ctx, [river[i], river[i + 1]], strokeWidth, color);
        }
    }
}

/**
 * A river system point with a baked-in stroke width.
 * Matches the shape produced by terrain.ts generateRiverSystems.
 */
export interface RiverSystemPoint {
    x: number;
    y: number;
    width?: number;
}
export interface RiverSystem {
    points: RiverSystemPoint[];
}

/**
 * Render drainage-basin river systems. Each river carries its own
 * `width` per point so the rendered stroke grows naturally as
 * tributaries merge downstream. Draws a quadratic Bezier through
 * each triple of points so the line stays smooth.
 */
export function renderRiverSystems(
    ctx: CanvasRenderingContext2D,
    cfg: { mapStyle: string },
    riverSystems: readonly RiverSystem[],
): void {
    const isBook = cfg.mapStyle === 'book';
    const isParchment = cfg.mapStyle === 'parchment';
    const color = isBook
        ? 'rgba(40, 65, 105, 0.7)'
        : isParchment
            ? PALETTES.parchment.water
            : '#4a90c4';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const river of riverSystems) {
        const pts = river.points;
        if (pts.length < 3) continue;

        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            ctx.strokeStyle = color;
            ctx.lineWidth = p1.width ?? 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);

            // Smooth quadratic curve through p1 -> p2 -> midpoint(p2, p3)
            if (i < pts.length - 2) {
                const p3 = pts[i + 2];
                const cpx = (p2.x + p3.x) / 2;
                const cpy = (p2.y + p3.y) / 2;
                ctx.quadraticCurveTo(p2.x, p2.y, cpx, cpy);
            } else {
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        }
    }

    ctx.restore();
}
