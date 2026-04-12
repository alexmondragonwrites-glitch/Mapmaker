/**
 * Lightweight SVG path parser for the story map data.
 *
 * The Calyndra JSON files use SVG path `d` attributes for routes
 * and region boundaries (M, L, C, Z commands only — no arcs, no
 * relative commands). This parser converts them into arrays of
 * {x, y} points that can be drawn on a Canvas 2D context.
 */

import type { Point } from './types';

// ── Cubic Bezier Interpolation ──────────────────────────────────

function cubicBezier(
    p0: number, p1: number, p2: number, p3: number, t: number,
): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function interpolateCubic(
    p0: Point, p1: Point, p2: Point, p3: Point, steps: number,
): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({
            x: cubicBezier(p0.x, p1.x, p2.x, p3.x, t),
            y: cubicBezier(p0.y, p1.y, p2.y, p3.y, t),
        });
    }
    return pts;
}

// ── SVG Path Parser ─────────────────────────────────────────────

/**
 * Parse an SVG path `d` string into an array of points.
 * Supports M (moveto), L (lineto), C (cubic bezier), Z (close).
 * All coordinates are absolute.
 *
 * Cubic bezier segments are interpolated into `bezierSteps` line
 * segments (default 20) for smooth curves on canvas.
 */
export function parseSVGPath(d: string, bezierSteps = 20): Point[] {
    if (!d) return [];

    // Tokenize: split on command letters, keeping the letter
    const tokens = d.match(/[MLCZ][^MLCZ]*/gi);
    if (!tokens) return [];

    const points: Point[] = [];
    let cursor: Point = { x: 0, y: 0 };
    let startPoint: Point = { x: 0, y: 0 };

    for (const token of tokens) {
        const cmd = token.charAt(0).toUpperCase();
        const nums = token.slice(1).trim().match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

        switch (cmd) {
            case 'M': {
                // MoveTo: pairs of (x, y). First pair is moveto, rest are implicit lineto.
                for (let i = 0; i + 1 < nums.length; i += 2) {
                    cursor = { x: nums[i], y: nums[i + 1] };
                    if (i === 0) startPoint = { ...cursor };
                    points.push({ ...cursor });
                }
                break;
            }
            case 'L': {
                // LineTo: pairs of (x, y)
                for (let i = 0; i + 1 < nums.length; i += 2) {
                    cursor = { x: nums[i], y: nums[i + 1] };
                    points.push({ ...cursor });
                }
                break;
            }
            case 'C': {
                // Cubic Bezier: groups of 6 numbers (x1,y1, x2,y2, x,y)
                for (let i = 0; i + 5 < nums.length; i += 6) {
                    const cp1: Point = { x: nums[i], y: nums[i + 1] };
                    const cp2: Point = { x: nums[i + 2], y: nums[i + 3] };
                    const end: Point = { x: nums[i + 4], y: nums[i + 5] };
                    // Skip first point (it's the current cursor = last point added)
                    const interp = interpolateCubic(cursor, cp1, cp2, end, bezierSteps);
                    for (let j = 1; j < interp.length; j++) {
                        points.push(interp[j]);
                    }
                    cursor = end;
                }
                break;
            }
            case 'Z': {
                // Close path: return to start
                if (startPoint.x !== cursor.x || startPoint.y !== cursor.y) {
                    points.push({ ...startPoint });
                }
                cursor = { ...startPoint };
                break;
            }
        }
    }

    return points;
}

// ── Coordinate Scaling ──────────────────────────────────────────

/**
 * Scale a set of points from one coordinate space to another.
 * Used to map the JSON viewBox (1000×650) to canvas pixels.
 */
export function scalePoints(
    points: readonly Point[],
    fromWidth: number,
    fromHeight: number,
    toWidth: number,
    toHeight: number,
): Point[] {
    const sx = toWidth / fromWidth;
    const sy = toHeight / fromHeight;
    return points.map(p => ({ x: p.x * sx, y: p.y * sy }));
}

/**
 * Scale a single coordinate pair from viewBox to canvas.
 */
export function scaleCoord(
    x: number, y: number,
    fromWidth: number, fromHeight: number,
    toWidth: number, toHeight: number,
): Point {
    return {
        x: (x / fromWidth) * toWidth,
        y: (y / fromHeight) * toHeight,
    };
}

// ── Canvas Drawing Helpers ──────────────────────────────────────

/**
 * Draw a polyline (array of points) on a canvas context.
 * Optionally close the path for filled shapes (regions).
 */
export function drawPointPath(
    ctx: CanvasRenderingContext2D,
    points: readonly Point[],
    close = false,
): void {
    if (points.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    if (close) ctx.closePath();
}
