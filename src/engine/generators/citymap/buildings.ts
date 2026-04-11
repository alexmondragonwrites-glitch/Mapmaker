/**
 * City buildings and district profiles.
 *
 * This module owns everything about "what sits on a city block":
 *
 *   - DISTRICT_PROFILES  The full table mapping every district type
 *                        (markt, wohn, hafen, ...) to its building
 *                        mix, density, spacing and ground tint.
 *
 *   - districtTint        Small helper the orchestrator passes into
 *                        layout.ts' `renderDistrictGrounds` so that
 *                        module doesn't need to import this one.
 *                        Keeps layout.ts buildings-agnostic.
 *
 *   - renderBuildings     Two-pass building placement:
 *                        (1) frontage pass - walks each road and
 *                            drops buildings on both sides so houses
 *                            line up along streets;
 *                        (2) infill pass - fills the interior of
 *                            each district with background clutter
 *                            so big empty blocks don't appear
 *                            between parallel roads.
 *
 *   - drawBuildingSmart   Bridge that prefers a loaded PNG asset
 *                        (Wonderdraft pack) for a given category if
 *                        one exists, otherwise falls back to the
 *                        procedural draw function.
 *
 * The DRAW_FN_CATEGORY map and `pickBuilding` helper stay private
 * because they're pure implementation details of the two renderers.
 */

import {
    drawHumanHouse, drawElvenHouse, drawDwarvenHouse,
    drawTower, drawTemple, drawTavern, drawTree,
    drawForge, drawChurch, drawGuildHall, drawWarehouse,
    drawWell, drawFountain, drawMarketStall, drawWindmill,
    drawStatue, drawBarracks, drawLibrary, drawDock,
    drawShack, drawNobleHouse, drawShrine, drawCastle,
} from '../../assets';
import { tryDrawAsset } from '../../assets-runtime/bridge';
import type { AssetCategory } from '../../assets-runtime';
import type { CityOutline, District, Point2D, Road } from './layout';

// ── Types ──────────────────────────────────────────────────────────

/** A drawable building primitive: takes ctx, x, y, size and optional options. */
type BuildingDrawFn = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    options?: unknown,
) => void;

/** A single entry in a district's building mix. */
export interface BuildingEntry {
    draw: BuildingDrawFn;
    /** Relative weight used by `pickBuilding` to choose entries. */
    weight: number;
    sizeMin: number;
    sizeMax: number;
}

/** A district's complete building mix plus its ground look. */
export interface DistrictProfile {
    buildings: BuildingEntry[];
    /** Building count multiplier (1.0 = normal). */
    density: number;
    /** Minimum spacing between two buildings of this district (px). */
    spacing: number;
    /** Overlay color for the district ground (hex). */
    groundTint: string;
    /** Opacity of the ground tint (0..1). */
    groundAlpha: number;
}

/** Config fields the building renderer reads. */
export interface BuildingRenderConfig {
    buildingDensity: number;
    style: 'human' | 'elven' | 'dwarven' | 'mixed' | string;
}

/** Minimal seeded RNG interface. */
interface RngLike {
    next(): number;
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
    pick<T>(arr: readonly T[]): T;
}

// ── Asset-category map and smart draw ──────────────────────────────

/**
 * Map procedural draw functions to their asset category, so the
 * bridge can look up PNG variants if the user has installed an asset
 * pack. Keyed by the function reference itself; the map is private
 * because no caller should need to reach into it.
 */
const DRAW_FN_CATEGORY = new Map<BuildingDrawFn, AssetCategory>([
    [drawHumanHouse,   'house_human'],
    [drawElvenHouse,   'house_elven'],
    [drawDwarvenHouse, 'house_dwarven'],
    [drawNobleHouse,   'house'],
    [drawShack,        'house'],
    [drawTower,        'tower'],
    [drawTemple,       'temple'],
    [drawChurch,       'church'],
    [drawShrine,       'shrine'],
    [drawTavern,       'tavern'],
    [drawCastle,       'castle'],
    [drawTree,         'tree'],
    [drawForge,        'forge'],
    [drawGuildHall,    'house'],
    [drawWarehouse,    'house'],
    [drawWell,         'decoration'],
    [drawFountain,     'decoration'],
    [drawMarketStall,  'decoration'],
    [drawWindmill,     'windmill'],
    [drawStatue,       'decoration'],
    [drawBarracks,     'house'],
    [drawLibrary,      'house'],
    [drawDock,         'decoration'],
]);

/**
 * Draw a building using the PNG asset if one is loaded for the
 * category, otherwise fall back to the procedural function. `seed`
 * is forwarded so asset variants stay deterministic per location.
 */
export function drawBuildingSmart(
    ctx: CanvasRenderingContext2D,
    drawFn: BuildingDrawFn,
    x: number,
    y: number,
    size: number,
    seed: number,
): void {
    const category = DRAW_FN_CATEGORY.get(drawFn);
    if (category && tryDrawAsset(ctx, category, x, y, size, seed)) return;
    drawFn(ctx, x, y, size);
}

// ── District profile table ─────────────────────────────────────────

/**
 * The full district profile table. Tweak weights/sizes here to
 * re-balance which buildings a district tends to spawn. Each entry
 * is referenced by the district type key (see layout.ts' DISTRICT_PRIORITY).
 */
export const DISTRICT_PROFILES: Record<string, DistrictProfile> = {
    markt: {
        buildings: [
            { draw: drawMarketStall, weight: 10, sizeMin: 10, sizeMax: 14 },
            { draw: drawHumanHouse,  weight: 4,  sizeMin: 10, sizeMax: 14 },
            { draw: drawTavern,      weight: 2,  sizeMin: 14, sizeMax: 18 },
            { draw: drawWell,        weight: 1,  sizeMin: 10, sizeMax: 12 },
        ],
        density: 1.2, spacing: 11,
        groundTint: '#c4a868', groundAlpha: 0.25,
    },
    wohn: {
        buildings: [
            { draw: drawHumanHouse,  weight: 10, sizeMin: 10, sizeMax: 14 },
            { draw: drawWell,        weight: 1,  sizeMin: 9,  sizeMax: 11 },
            { draw: drawTavern,      weight: 1,  sizeMin: 14, sizeMax: 16 },
        ],
        density: 1.0, spacing: 12,
        groundTint: '#8a7a5a', groundAlpha: 0.15,
    },
    handwerk: {
        buildings: [
            { draw: drawForge,       weight: 4,  sizeMin: 14, sizeMax: 18 },
            { draw: drawHumanHouse,  weight: 6,  sizeMin: 10, sizeMax: 13 },
            { draw: drawWarehouse,   weight: 3,  sizeMin: 16, sizeMax: 22 },
            { draw: drawGuildHall,   weight: 1,  sizeMin: 18, sizeMax: 24 },
        ],
        density: 1.0, spacing: 14,
        groundTint: '#6a5a4a', groundAlpha: 0.2,
    },
    adel: {
        buildings: [
            { draw: drawNobleHouse,  weight: 8,  sizeMin: 16, sizeMax: 22 },
            { draw: drawLibrary,     weight: 1,  sizeMin: 20, sizeMax: 26 },
            { draw: drawStatue,      weight: 2,  sizeMin: 12, sizeMax: 16 },
            { draw: drawFountain,    weight: 1,  sizeMin: 14, sizeMax: 18 },
        ],
        density: 0.6, spacing: 22,
        groundTint: '#b0a080', groundAlpha: 0.25,
    },
    hafen: {
        buildings: [
            { draw: drawWarehouse,   weight: 8,  sizeMin: 18, sizeMax: 24 },
            { draw: drawTavern,      weight: 3,  sizeMin: 14, sizeMax: 18 },
            { draw: drawHumanHouse,  weight: 4,  sizeMin: 10, sizeMax: 13 },
            { draw: drawDock,        weight: 3,  sizeMin: 18, sizeMax: 22 },
        ],
        density: 0.9, spacing: 16,
        groundTint: '#6a6a5a', groundAlpha: 0.2,
    },
    tempel: {
        buildings: [
            { draw: drawChurch,      weight: 3,  sizeMin: 18, sizeMax: 24 },
            { draw: drawShrine,      weight: 6,  sizeMin: 10, sizeMax: 14 },
            { draw: drawTemple,      weight: 2,  sizeMin: 22, sizeMax: 28 },
            { draw: drawStatue,      weight: 2,  sizeMin: 10, sizeMax: 14 },
            { draw: drawHumanHouse,  weight: 2,  sizeMin: 10, sizeMax: 12 },
        ],
        density: 0.7, spacing: 18,
        groundTint: '#aaa090', groundAlpha: 0.25,
    },
    garten: {
        buildings: [
            { draw: drawTree,        weight: 15, sizeMin: 8,  sizeMax: 14 },
            { draw: drawFountain,    weight: 2,  sizeMin: 14, sizeMax: 18 },
            { draw: drawStatue,      weight: 2,  sizeMin: 10, sizeMax: 14 },
            { draw: drawShrine,      weight: 1,  sizeMin: 10, sizeMax: 12 },
        ],
        density: 0.9, spacing: 14,
        groundTint: '#4a7a3a', groundAlpha: 0.3,
    },
    armen: {
        buildings: [
            { draw: drawShack,       weight: 15, sizeMin: 8,  sizeMax: 11 },
            { draw: drawHumanHouse,  weight: 3,  sizeMin: 9,  sizeMax: 11 },
            { draw: drawTavern,      weight: 1,  sizeMin: 12, sizeMax: 14 },
        ],
        density: 1.4, spacing: 9,
        groundTint: '#4a3a2a', groundAlpha: 0.3,
    },
    akademie: {
        buildings: [
            { draw: drawLibrary,     weight: 4,  sizeMin: 20, sizeMax: 26 },
            { draw: drawTower,       weight: 3,  sizeMin: 16, sizeMax: 22 },
            { draw: drawStatue,      weight: 3,  sizeMin: 12, sizeMax: 16 },
            { draw: drawHumanHouse,  weight: 4,  sizeMin: 10, sizeMax: 13 },
            { draw: drawShrine,      weight: 1,  sizeMin: 10, sizeMax: 12 },
        ],
        density: 0.7, spacing: 18,
        groundTint: '#9a90a0', groundAlpha: 0.2,
    },
    kaserne: {
        buildings: [
            { draw: drawBarracks,    weight: 6,  sizeMin: 18, sizeMax: 24 },
            { draw: drawTower,       weight: 4,  sizeMin: 14, sizeMax: 18 },
            { draw: drawWarehouse,   weight: 2,  sizeMin: 16, sizeMax: 20 },
            { draw: drawStatue,      weight: 1,  sizeMin: 12, sizeMax: 14 },
        ],
        density: 0.7, spacing: 18,
        groundTint: '#5a4a3a', groundAlpha: 0.25,
    },
};

/**
 * Ground-tint helper for the orchestrator to pass into layout.ts'
 * `renderDistrictGrounds`, so that module doesn't need to import
 * DISTRICT_PROFILES. Returns null for unknown district types.
 */
export function districtTint(
    type: string,
): { hex: string; alpha: number } | null {
    const profile = DISTRICT_PROFILES[type];
    return profile
        ? { hex: profile.groundTint, alpha: profile.groundAlpha }
        : null;
}

// ── Weighted building picker ───────────────────────────────────────

/**
 * Pick one entry from a district profile's building mix, weighted
 * by its `weight` field. Falls back to the first entry if the roll
 * underflows (shouldn't happen in practice).
 */
function pickBuilding(profile: DistrictProfile, rng: RngLike): BuildingEntry {
    const totalWeight = profile.buildings.reduce((s, b) => s + b.weight, 0);
    let roll = rng.next() * totalWeight;
    for (const entry of profile.buildings) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    return profile.buildings[0];
}

// ── Main building renderer ─────────────────────────────────────────

/**
 * Two-pass building placement for every district in the city:
 *
 *   Pass 1 (frontage): walk each road and drop buildings on both
 *     sides of the road at a fixed stride so houses line up along
 *     the streets. Respects river, outline, spacing and density
 *     filters.
 *
 *   Pass 2 (infill): for each district, fill in background clutter
 *     so we don't have big empty blocks between parallel roads. The
 *     infill target count scales with district area and density.
 *
 * The "culture override" replaces generic `drawHumanHouse` with the
 * appropriate elven/dwarven variant when the user picks a non-human
 * or mixed city style.
 */
export function renderBuildings(
    ctx: CanvasRenderingContext2D,
    cfg: BuildingRenderConfig,
    districts: readonly District[],
    roads: readonly Road[],
    riverPoints: readonly Point2D[],
    outline: CityOutline,
    rng: RngLike,
): void {
    const { buildingDensity, style } = cfg;

    // Global placed list so buildings from different roads don't overlap
    const placed: Array<{ x: number; y: number; r: number }> = [];

    // Helper: find the district whose radius contains (x, y), or
    // otherwise the nearest district by distance. The secondary
    // branch deliberately reuses the District shape and stores a
    // `distance` field on it; this is the legacy behaviour kept
    // verbatim for visual parity.
    const findDistrict = (x: number, y: number): District | null => {
        let best: (District & { distance?: number }) | null = null;
        let bestScore = Infinity;
        for (const d of districts) {
            const dd = Math.hypot(x - d.x, y - d.y);
            if (dd <= d.radius) {
                const score = dd - d.radius; // more negative is better
                if (score < bestScore) { bestScore = score; best = d as District & { distance?: number }; }
            } else if (bestScore === Infinity) {
                if (!best || dd < (best.distance ?? Infinity)) {
                    best = d as District & { distance?: number };
                    best.distance = dd;
                }
            }
        }
        return best;
    };

    // Helper: is (x, y) too close to any road segment?
    const isOnRoad = (x: number, y: number, margin: number): boolean => {
        for (const road of roads) {
            for (const pt of road.points) {
                if (Math.hypot(x - pt.x, y - pt.y) < margin) return true;
            }
        }
        return false;
    };

    // Helper: is (x, y) in the river?
    const isInRiver = (x: number, y: number, margin: number): boolean => {
        for (const pt of riverPoints) {
            if (Math.hypot(x - pt.x, y - pt.y) < margin) return true;
        }
        return false;
    };

    // Helper: pick the draw function with culture override for generic houses.
    const effectiveDrawFn = (entry: BuildingEntry): BuildingDrawFn => {
        if (entry.draw !== drawHumanHouse || style === 'human') return entry.draw;
        const effective = style === 'mixed'
            ? rng.pick(['human', 'elven', 'dwarven'] as const)
            : style;
        if (effective === 'elven')   return drawElvenHouse;
        if (effective === 'dwarven') return drawDwarvenHouse;
        return entry.draw;
    };

    // ── Pass 1: frontage ──
    // Walk each road and sample candidate points along the polyline
    // at a fixed stride. For each sample, try placing a building on
    // both sides of the road offset perpendicular to the direction.
    for (const road of roads) {
        // Plaza ring is too tight for frontage buildings
        if (road.type === 'plaza') continue;

        // How far out from the road centerline to place buildings
        const offset = road.width / 2 + 9;

        // Main roads can afford denser frontage than branches
        const stride = road.type === 'main' ? 14 : 12;

        let acc = 0;
        for (let i = 1; i < road.points.length; i++) {
            const a = road.points[i - 1];
            const b = road.points[i];
            const segDx = b.x - a.x;
            const segDy = b.y - a.y;
            const segLen = Math.hypot(segDx, segDy);
            if (segLen < 0.01) continue;

            // Perpendicular unit vector
            const px = -segDy / segLen;
            const py = segDx / segLen;

            acc += segLen;
            while (acc >= stride) {
                acc -= stride;
                const t = (stride - acc) / segLen;
                const cxOnRoad = a.x + segDx * (1 - t);
                const cyOnRoad = a.y + segDy * (1 - t);

                // Try both sides of the road
                for (const side of [+1, -1]) {
                    const jitter = rng.nextFloat(-2, 2);
                    const bx = cxOnRoad + px * side * offset + px * side * jitter;
                    const by = cyOnRoad + py * side * offset + py * side * jitter;

                    if (!outline.containsPoint(bx, by, 6)) continue;
                    if (isOnRoad(bx, by, 6)) continue;
                    if (isInRiver(bx, by, 12)) continue;

                    // Spacing against already-placed buildings
                    let tooClose = false;
                    for (const p of placed) {
                        if (Math.hypot(bx - p.x, by - p.y) < p.r) { tooClose = true; break; }
                    }
                    if (tooClose) continue;

                    // Find which district owns this spot
                    const district = findDistrict(bx, by);
                    if (!district) continue;
                    const profile = DISTRICT_PROFILES[district.type];
                    if (!profile) continue;

                    // Density gate: leave some spots intentionally empty
                    if (rng.next() > buildingDensity * profile.density * 0.95) continue;

                    const entry = pickBuilding(profile, rng);
                    const size = rng.nextFloat(entry.sizeMin, entry.sizeMax);
                    const drawFn = effectiveDrawFn(entry);

                    const variantSeed = (Math.floor(bx) * 73856093) ^ (Math.floor(by) * 19349663);
                    drawBuildingSmart(ctx, drawFn, bx, by, size, variantSeed);
                    placed.push({ x: bx, y: by, r: profile.spacing });
                }
            }
        }
    }

    // ── Pass 2: district interior infill ──
    // For each district, fill the interior with background clutter
    // so we don't have big empty blocks between parallel roads. The
    // infill count scales with district area and density.
    for (const district of districts) {
        const profile = DISTRICT_PROFILES[district.type];
        if (!profile) continue;

        const area = Math.PI * district.radius * district.radius;
        const targetCount = Math.floor(
            (area / (profile.spacing * profile.spacing * 3)) * buildingDensity * profile.density,
        );

        let attempts = 0;
        let placedThis = 0;
        while (placedThis < targetCount && attempts < targetCount * 8) {
            attempts++;
            const angle = rng.nextFloat(0, Math.PI * 2);
            const dist = Math.sqrt(rng.next()) * district.radius;
            const bx = district.x + Math.cos(angle) * dist;
            const by = district.y + Math.sin(angle) * dist;

            if (!outline.containsPoint(bx, by, 8)) continue;
            if (isOnRoad(bx, by, 7)) continue;
            if (isInRiver(bx, by, 14)) continue;

            let tooClose = false;
            for (const p of placed) {
                if (Math.hypot(bx - p.x, by - p.y) < p.r) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const entry = pickBuilding(profile, rng);
            const size = rng.nextFloat(entry.sizeMin, entry.sizeMax);
            const drawFn = effectiveDrawFn(entry);

            const variantSeed = (Math.floor(bx) * 73856093) ^ (Math.floor(by) * 19349663);
            drawBuildingSmart(ctx, drawFn, bx, by, size, variantSeed);
            placed.push({ x: bx, y: by, r: profile.spacing });
            placedThis++;
        }
    }
}
