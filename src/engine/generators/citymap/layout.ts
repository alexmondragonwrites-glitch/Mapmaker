/**
 * City layout primitives.
 *
 * This module owns the "grey box" of every city map: the outline
 * polygon, the district slots, the wall ring, the road network, and
 * the bridges where roads cross rivers. Buildings and decorations
 * sit on top of these primitives but live in separate modules
 * (citymap/buildings.ts, citymap/landmarks.ts).
 *
 * Design notes:
 *
 *   - `generateCityOutline` is the source of truth for city shape.
 *     Every downstream function takes an `outline` parameter with
 *     cx/cy/avgRadius/containsPoint/etc., so they don't need to
 *     know how the shape was built.
 *
 *   - `_computeGates` produces the canonical gate list that the
 *     wall renderer AND the countryside renderer use, so wall gates
 *     and outbound-road gates line up exactly.
 *
 *   - Roads use a gate-and-heart system (not radial spokes). The
 *     "heart" is a jittered point near the geometric centre;
 *     3-4 gates sit on the outline; main roads are Bezier curves
 *     from each gate to the heart; branches wander off main roads
 *     to fill the interior.
 */

import { PALETTES } from '../../../utils';
import { drawTower, drawBridge } from '../../assets';

// ── Types ──────────────────────────────────────────────────────────

/** Config fields every layout function reads. */
export interface CityLayoutConfig {
    citySize: string;
    width: number;
    height: number;
    districtCount: number;
}

/** A single 2D point. */
export interface Point2D {
    x: number;
    y: number;
}

/** An outline vertex with the corresponding radial angle. */
export interface OutlineVertex extends Point2D {
    angle: number;
    r: number;
}

/** The full city outline polygon returned by `generateCityOutline`. */
export interface CityOutline {
    points: OutlineVertex[];
    cx: number;
    cy: number;
    baseRadius: number;
    avgRadius: number;
    maxRadius: number;
    radiusAt(angle: number): number;
    containsPoint(x: number, y: number, margin?: number): boolean;
}

/** A gate along the outline. */
export interface GatePoint extends Point2D {
    idx: number;
}

/** A district slot with its type, label, location and radius. */
export interface District {
    x: number;
    y: number;
    type: string;
    name: string;
    radius: number;
    angle: number;
}

/** A road polyline plus metadata. */
export interface Road {
    type: 'main' | 'plaza' | 'branch';
    points: Point2D[];
    width: number;
}

/** Minimal seeded RNG shape. */
interface RngLike {
    next(): number;
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
}

/** Minimal Simplex noise shape. */
interface NoiseLike {
    noise2D(x: number, y: number): number;
}

// ── City radius ────────────────────────────────────────────────────

/**
 * Base radius of the city outline, scaled by the city size preset.
 * Used as input to `generateCityOutline` so different city sizes
 * still honour the same outline-generation algorithm.
 */
export function getCityRadius(cfg: CityLayoutConfig): number {
    const base = Math.min(cfg.width, cfg.height) * 0.35;
    switch (cfg.citySize) {
        case 'small':      return base * 0.5;
        case 'medium':     return base * 0.7;
        case 'large':      return base * 0.85;
        case 'metropolis': return base * 1.0;
        default:           return base * 0.7;
    }
}

// ── Outline generation ─────────────────────────────────────────────

/**
 * Generate an organic city outline: a noise-deformed polygon centered
 * on (cx, cy) with a base radius of `baseRadius`. The deformation
 * combines several noise octaves plus a seeded directional stretch
 * and an asymmetric lobe, so no two seeds produce identical shapes
 * and none of them look like perfect circles.
 */
export function generateCityOutline(
    cx: number,
    cy: number,
    baseRadius: number,
    seed: number,
    noise: NoiseLike,
): CityOutline {
    // Seed-driven stretch axis and lobe so the same seed is reproducible
    const stretchAngle = ((seed * 0.0001) % 1) * Math.PI * 2;
    const stretchAmount = 0.15 + ((seed * 0.00013) % 1) * 0.25;     // 15-40%
    const lobeAngle = stretchAngle + Math.PI * 0.5;
    const lobeStrength = 0.08 + ((seed * 0.00017) % 1) * 0.14;       // 8-22%

    const segments = 96;
    const points: OutlineVertex[] = [];

    const radiusAt = (angle: number): number => {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        // Multi-octave noise around the unit circle
        const n1 = noise.noise2D(dx * 1.3, dy * 1.3);
        const n2 = noise.noise2D(dx * 3.1 + 50, dy * 3.1 + 50);
        const n3 = noise.noise2D(dx * 6.2 + 99, dy * 6.2 + 99);
        const combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

        const stretchDot = Math.cos(angle - stretchAngle);
        const stretchMul = 1 + stretchDot * stretchDot * stretchAmount;

        const lobeDot = Math.max(0, Math.cos(angle - lobeAngle));
        const lobeMul = 1 + lobeDot * lobeStrength;

        const deform = (1 + combined * 0.35) * stretchMul * lobeMul;
        return baseRadius * deform;
    };

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const r = radiusAt(angle);
        points.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
            angle,
            r,
        });
    }

    // Aggregate metrics
    let sumR = 0;
    let maxR = 0;
    for (const p of points) {
        sumR += p.r;
        if (p.r > maxR) maxR = p.r;
    }
    const avgRadius = sumR / points.length;

    return {
        points,
        cx,
        cy,
        baseRadius,
        avgRadius,
        maxRadius: maxR,
        radiusAt,
        containsPoint(x: number, y: number, margin: number = 0): boolean {
            const angle = Math.atan2(y - cy, x - cx);
            const d = Math.hypot(x - cx, y - cy);
            return d <= radiusAt(angle) - margin;
        },
    };
}

// ── Gates ──────────────────────────────────────────────────────────

/**
 * Gate positions along the outline. Fixed fractions (0, 0.25, 0.5,
 * 0.75) so the wall renderer, the countryside roads and anything
 * else that cares about gates all agree on the same points.
 */
export function computeGates(outline: CityOutline): GatePoint[] {
    const pts = outline.points;
    const gateFractions = [0.0, 0.25, 0.5, 0.75];
    return gateFractions.map(f => {
        const idx = Math.floor(f * pts.length);
        return { x: pts[idx].x, y: pts[idx].y, idx };
    });
}

// ── District slots ─────────────────────────────────────────────────

/**
 * Districts know about themselves - this table maps internal keys
 * to display names. Kept here because it's a layout concern
 * (district slots live in layout.ts), not a building concern.
 */
const DISTRICT_DISPLAY_NAMES: Record<string, string> = {
    markt:    'Marktviertel',
    wohn:     'Wohnviertel',
    handwerk: 'Handwerkerviertel',
    adel:     'Adelsviertel',
    hafen:    'Hafenviertel',
    tempel:   'Tempelviertel',
    garten:   'Gartenviertel',
    armen:    'Armenviertel',
    akademie: 'Akademieviertel',
    kaserne:  'Kasernenviertel',
};

/**
 * Semantic placement preferences per district type.
 *   centerBias: pull toward the city heart (0..1)
 *   edgeBias:   push toward the outer walls (0..1)
 *   riverBias:  attraction to the nearest river point (0..1)
 * Each score contributes independently; a hafen district with
 * riverBias 1.0 will strongly prefer water-adjacent positions.
 */
const DISTRICT_PREFS: Record<string, {
    centerBias: number;
    edgeBias: number;
    riverBias: number;
}> = {
    markt:    { centerBias: 0.9, edgeBias: 0.0, riverBias: 0.0 },
    tempel:   { centerBias: 0.6, edgeBias: 0.0, riverBias: 0.0 },
    adel:     { centerBias: 0.7, edgeBias: 0.0, riverBias: 0.0 },
    akademie: { centerBias: 0.5, edgeBias: 0.0, riverBias: 0.0 },
    wohn:     { centerBias: 0.2, edgeBias: 0.2, riverBias: 0.0 },
    handwerk: { centerBias: 0.1, edgeBias: 0.3, riverBias: 0.2 },
    hafen:    { centerBias: 0.0, edgeBias: 0.6, riverBias: 1.0 },
    armen:    { centerBias: 0.0, edgeBias: 0.7, riverBias: 0.0 },
    kaserne:  { centerBias: 0.0, edgeBias: 0.8, riverBias: 0.0 },
    garten:   { centerBias: 0.1, edgeBias: 0.4, riverBias: 0.0 },
};

/** Priority order - districts that almost always appear come first. */
const DISTRICT_PRIORITY = [
    'markt', 'tempel', 'wohn', 'handwerk', 'hafen',
    'adel', 'kaserne', 'akademie', 'garten', 'armen',
];

/**
 * Place `cfg.districtCount` districts inside the outline using a
 * score-based candidate search. Each district tries 60 random
 * candidate points, scores them against its semantic preferences,
 * applies a minimum-spacing penalty against already-placed districts,
 * and keeps the best-scoring location.
 */
export function generateDistricts(
    cfg: CityLayoutConfig,
    rng: RngLike,
    outline: CityOutline,
    riverPoints: readonly Point2D[],
): District[] {
    const districts: District[] = [];
    const count = Math.min(cfg.districtCount, DISTRICT_PRIORITY.length);
    const chosen = DISTRICT_PRIORITY.slice(0, count);

    const cx = outline.cx;
    const cy = outline.cy;
    const avgR = outline.avgRadius;

    for (const type of chosen) {
        const p = DISTRICT_PREFS[type] ?? { centerBias: 0.4, edgeBias: 0.3, riverBias: 0 };

        let bestX = cx;
        let bestY = cy;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < 60; attempt++) {
            const angle = rng.nextFloat(0, Math.PI * 2);
            const maxR = outline.radiusAt(angle) * 0.85;

            // Radial sampling biased by center vs edge preference
            const t = p.centerBias > p.edgeBias
                ? rng.nextFloat(0, 1) * rng.nextFloat(0, 1)    // -> small values
                : Math.sqrt(rng.nextFloat(0, 1));              // -> large values

            const dist = t * maxR;
            const x = cx + Math.cos(angle) * dist;
            const y = cy + Math.sin(angle) * dist;

            let score = 0;
            const centerDist = Math.hypot(x - cx, y - cy);
            score += (1 - centerDist / avgR) * p.centerBias * 10;
            score += (centerDist / avgR) * p.edgeBias * 10;

            if (p.riverBias > 0 && riverPoints.length > 0) {
                let minRiverDist = Infinity;
                for (const rp of riverPoints) {
                    const d = Math.hypot(x - rp.x, y - rp.y);
                    if (d < minRiverDist) minRiverDist = d;
                }
                const normalized = Math.min(1, minRiverDist / avgR);
                score += (1 - normalized) * p.riverBias * 12;
            }

            // Spacing penalty against already-placed districts
            let tooClose = false;
            for (const d of districts) {
                const dd = Math.hypot(x - d.x, y - d.y);
                const minSpacing = d.radius + avgR * 0.15;
                if (dd < minSpacing) { tooClose = true; break; }
                if (dd < avgR * 0.3) score -= (avgR * 0.3 - dd) * 0.5;
            }
            if (tooClose) continue;

            score += rng.nextFloat(0, 2);

            if (score > bestScore) {
                bestScore = score;
                bestX = x;
                bestY = y;
            }
        }

        const radius = avgR * rng.nextFloat(0.18, 0.28);
        districts.push({
            x: bestX,
            y: bestY,
            type,
            name: DISTRICT_DISPLAY_NAMES[type],
            radius,
            angle: Math.atan2(bestY - cy, bestX - cx),
        });
    }

    return districts;
}

/**
 * Paint a soft radial tint under each district to visually separate
 * them. Drawn before walls and roads so those overlay the tints.
 * The profile tint comes from `districtTintFor(type)` which the
 * buildings module provides; we import it via a small helper map
 * passed in by the orchestrator to avoid a circular import.
 */
export function renderDistrictGrounds(
    ctx: CanvasRenderingContext2D,
    districts: readonly District[],
    tintOf: (type: string) => { hex: string; alpha: number } | null,
): void {
    ctx.save();
    for (const district of districts) {
        const tint = tintOf(district.type);
        if (!tint) continue;

        const gradient = ctx.createRadialGradient(
            district.x, district.y, 0,
            district.x, district.y, district.radius * 1.15,
        );

        const r = parseInt(tint.hex.slice(1, 3), 16);
        const g = parseInt(tint.hex.slice(3, 5), 16);
        const b = parseInt(tint.hex.slice(5, 7), 16);

        gradient.addColorStop(0,   `rgba(${r}, ${g}, ${b}, ${tint.alpha})`);
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${tint.alpha * 0.5})`);
        gradient.addColorStop(1,   `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(district.x, district.y, district.radius * 1.15, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ── Walls ──────────────────────────────────────────────────────────

/**
 * Draw the city walls along the outline polygon. Three layered
 * strokes (shadow, body, top) produce a hand-drawn stone look.
 * Towers spawn at ~8 evenly-spaced outline vertices.
 * Gate positions come from `computeGates` so every pass agrees.
 */
export function renderWalls(
    ctx: CanvasRenderingContext2D,
    outline: CityOutline,
    gates: readonly GatePoint[],
): void {
    ctx.save();
    const wallPoints = outline.points;

    // Wall shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 10;
    drawClosedPath(ctx, wallPoints);

    // Wall body
    ctx.strokeStyle = PALETTES.city.wall;
    ctx.lineWidth = 6;
    drawClosedPath(ctx, wallPoints);

    // Wall top
    ctx.strokeStyle = PALETTES.city.wallTop;
    ctx.lineWidth = 3;
    drawClosedPath(ctx, wallPoints);

    // ~8 towers along the outline
    const towerCount = 8;
    const towerStep = Math.floor(wallPoints.length / towerCount);
    for (let i = 0; i < wallPoints.length; i += towerStep) {
        drawTower(ctx, wallPoints[i].x, wallPoints[i].y, 14);
    }

    // Gates
    for (const gate of gates) {
        ctx.fillStyle = PALETTES.city.wall;
        ctx.fillRect(gate.x - 8, gate.y - 4, 16, 8);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(gate.x - 4, gate.y - 3, 8, 6);
    }

    ctx.restore();
}

/** Internal helper: stroke a closed polyline through `points`. */
function drawClosedPath(
    ctx: CanvasRenderingContext2D,
    points: readonly Point2D[],
): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
}

// ── Roads ──────────────────────────────────────────────────────────

/**
 * Build an organic city road network:
 *   1. A "heart" point jittered ±15% avg-radius from the outline centre.
 *   2. 3-4 gate points sampled on the outline polygon.
 *   3. Main roads: one Bezier curve from each gate to the heart, with
 *      a perpendicular control offset so they don't look straight.
 *   4. A small plaza ring around the heart.
 *   5. 6-10 branching secondary streets that start mid-way on a main
 *      road and wander toward a random interior point inside the
 *      outline, with a sinusoidal wiggle for a meandering medieval look.
 */
export function generateRoads(
    outline: CityOutline,
    rng: RngLike,
): Road[] {
    const roads: Road[] = [];
    const cx = outline.cx;
    const cy = outline.cy;

    const heartJitter = outline.avgRadius * 0.15;
    const heart: Point2D = {
        x: cx + rng.nextFloat(-heartJitter, heartJitter),
        y: cy + rng.nextFloat(-heartJitter, heartJitter),
    };

    // 3-4 gates on the outline
    const gateCount = rng.nextInt(3, 4);
    const pts = outline.points;
    const gates: Point2D[] = [];
    for (let i = 0; i < gateCount; i++) {
        const baseIdx = Math.floor((i / gateCount) * pts.length);
        const jitter = rng.nextInt(-5, 5);
        const idx = ((baseIdx + jitter) % pts.length + pts.length) % pts.length;
        gates.push({ x: pts[idx].x, y: pts[idx].y });
    }

    // Main roads: Bezier from each gate to the heart
    for (const gate of gates) {
        const dx = heart.x - gate.x;
        const dy = heart.y - gate.y;
        const len = Math.hypot(dx, dy);
        const px = -dy / len;
        const py = dx / len;
        const curve = rng.nextFloat(-len * 0.15, len * 0.15);
        const controlX = (gate.x + heart.x) / 2 + px * curve;
        const controlY = (gate.y + heart.y) / 2 + py * curve;

        const samples = 20;
        const points: Point2D[] = [];
        for (let t = 0; t <= samples; t++) {
            const u = t / samples;
            const mt = 1 - u;
            const x = mt * mt * gate.x + 2 * mt * u * controlX + u * u * heart.x;
            const y = mt * mt * gate.y + 2 * mt * u * controlY + u * u * heart.y;
            points.push({ x, y });
        }
        roads.push({ type: 'main', points, width: 5 });
    }

    // Plaza ring around the heart
    const plazaRadius = outline.avgRadius * 0.08;
    const plazaPoints: Point2D[] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.2) {
        plazaPoints.push({
            x: heart.x + Math.cos(a) * plazaRadius,
            y: heart.y + Math.sin(a) * plazaRadius,
        });
    }
    roads.push({ type: 'plaza', points: plazaPoints, width: 4 });

    // Branching secondary streets
    const branchCount = 6 + Math.floor(gateCount * 2);
    for (let b = 0; b < branchCount; b++) {
        const mainRoads = roads.filter(r => r.type === 'main');
        if (mainRoads.length === 0) break;
        const source = mainRoads[rng.nextInt(0, mainRoads.length - 1)];

        const startIdx = rng.nextInt(2, source.points.length - 3);
        const start = source.points[startIdx];

        let target: Point2D | null = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            const tAngle = rng.nextFloat(0, Math.PI * 2);
            const tDist = rng.nextFloat(outline.avgRadius * 0.2, outline.avgRadius * 0.7);
            const tx = cx + Math.cos(tAngle) * tDist;
            const ty = cy + Math.sin(tAngle) * tDist;
            if (outline.containsPoint(tx, ty, 10) && Math.hypot(tx - start.x, ty - start.y) > 40) {
                target = { x: tx, y: ty };
                break;
            }
        }
        if (!target) continue;

        const segLen = 12;
        const totalDist = Math.hypot(target.x - start.x, target.y - start.y);
        const steps = Math.max(2, Math.ceil(totalDist / segLen));
        const sdx = (target.x - start.x) / steps;
        const sdy = (target.y - start.y) / steps;
        const wiggleLen = Math.hypot(sdx, sdy);
        const wpx = wiggleLen > 0 ? -sdy / wiggleLen : 0;
        const wpy = wiggleLen > 0 ?  sdx / wiggleLen : 0;

        const branchPoints: Point2D[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const wiggle = Math.sin(t * Math.PI) * rng.nextFloat(-6, 6);
            branchPoints.push({
                x: start.x + sdx * i + wpx * wiggle,
                y: start.y + sdy * i + wpy * wiggle,
            });
        }
        roads.push({ type: 'branch', points: branchPoints, width: 2.5 });
    }

    return roads;
}

/**
 * Draw a list of roads. Each road is rendered as a shadow stroke
 * followed by a surface stroke so they have a subtle edge glow.
 */
export function renderRoads(
    ctx: CanvasRenderingContext2D,
    roads: readonly Road[],
): void {
    ctx.save();
    for (const road of roads) {
        // Shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = road.width + 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(road.points[0].x, road.points[0].y);
        for (let i = 1; i < road.points.length; i++) {
            ctx.lineTo(road.points[i].x, road.points[i].y);
        }
        ctx.stroke();

        // Surface
        ctx.strokeStyle = PALETTES.city.road;
        ctx.lineWidth = road.width;
        ctx.beginPath();
        ctx.moveTo(road.points[0].x, road.points[0].y);
        for (let i = 1; i < road.points.length; i++) {
            ctx.lineTo(road.points[i].x, road.points[i].y);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ── Bridges ────────────────────────────────────────────────────────

/**
 * Find intersections between roads and river points, and drop a
 * bridge there. Minimum spacing of 40 px between bridges prevents
 * tiny bundles of bridges where several road segments coincide.
 */
export function renderBridges(
    ctx: CanvasRenderingContext2D,
    roads: readonly Road[],
    riverPoints: readonly Point2D[],
): void {
    const bridgeThreshold = 8;
    const minBridgeSpacing = 40;
    const placedBridges: Point2D[] = [];

    for (const road of roads) {
        for (let i = 0; i < road.points.length - 1; i++) {
            const a = road.points[i];
            const b = road.points[i + 1];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;

            for (const rp of riverPoints) {
                const d = Math.hypot(mx - rp.x, my - rp.y);
                if (d >= bridgeThreshold) continue;

                let tooClose = false;
                for (const bridge of placedBridges) {
                    if (Math.hypot(mx - bridge.x, my - bridge.y) < minBridgeSpacing) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) break;

                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                drawBridge(ctx, rp.x, rp.y, 22, angle);
                placedBridges.push({ x: rp.x, y: rp.y });
                break;
            }
        }
    }
}
