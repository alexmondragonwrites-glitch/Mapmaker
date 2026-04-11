/**
 * City placement, roads and labels for the world map.
 *
 * This file bundles everything that sits on top of the terrain and
 * deals with "inhabited places":
 *
 *   generateCities()      Score-based placement of cities, with
 *                         lore cities taking priority over procedural
 *                         fill. Coastal, river-adjacent spots are
 *                         preferred; proximity to existing cities
 *                         is penalised.
 *   renderCities()        Draws each city: a castle asset for
 *                         capitals/large, a labelled circle for
 *                         smaller settlements.
 *   renderBookCities()    Book-style variant with hand-drawn icons.
 *   renderRoads()         Draws lore-defined roads first (thicker,
 *                         labelled) then nearest-neighbour procedural
 *                         roads between cities.
 *   renderLabels()        City name labels + river name labels.
 *   renderTitle()         The map title cartouche (from loreHints if
 *                         available, otherwise falls back to Calyndra).
 *
 * Keeping all five together makes it easy to understand the overall
 * city-system as a single unit - generation feeds placement, roads
 * read from placement, and labels read from both.
 */

import { clamp, distance, PALETTES } from '../../../../utils';
import type { NameGenerator } from '../../../../utils';
import { drawCastleSmart } from '../../../assets-runtime/bridge';
import { drawBookCity } from '../../../bookstyle';

/** Subset of config the city/road functions care about. */
export interface CityMapConfig {
    width: number;
    height: number;
    seaLevel: number;
    mountainLevel: number;
    cityCount: number;
    mapStyle: string;
}

/** Minimal RNG interface. */
interface RngLike {
    next(): number;
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
}

/** A simple river polyline (see features/rivers.ts). */
export type SimpleRiverLike = Array<{ x: number; y: number }>;

/** A city record produced by generateCities(). */
export interface CityRecord {
    x: number;
    y: number;
    name: string;
    size: 'small' | 'medium' | 'large';
    style?: string;
    isCapital: boolean;
    loreId?: string;
    description?: string;
    fromLore?: boolean;
}

/** Shape of a lore-driven city hint (see loreManager.getWorldMapHints). */
interface LoreCityHint {
    id: string;
    name: string;
    description?: string;
    relX: number | null;
    relY: number | null;
    regionId?: string;
    size?: string;
    style?: string;
    isCapital?: boolean;
}

/** Shape of a lore region hint for city placement fallback. */
interface LoreRegionHint {
    id: string;
    relX: number;
    relY: number;
}

/** Shape of a lore road hint for the road renderer. */
interface LoreRoadHint {
    name?: string;
    fromCityId: string;
    toCityId: string;
}

/** Top-level shape of the lore hints object used by this module. */
export interface LoreHintsForCities {
    worldName?: string;
    worldDescription?: string;
    cities: LoreCityHint[];
    regions: LoreRegionHint[];
    roads: LoreRoadHint[];
    rivers: Array<{ name?: string }>;
}

// ── City generation ────────────────────────────────────────────────

/**
 * Place cities on the world map using a score-based algorithm.
 *
 * Phase 1: lore cities
 *   For each city in loreHints, try to use its explicit relative
 *   position (relX, relY). Fall back to the centre of its assigned
 *   region. Fall back again to a random land spot. Always snap to
 *   land if the chosen pixel is underwater.
 *
 * Phase 2: procedural fill
 *   Try up to 100 candidate positions per missing city slot. Score:
 *     +2 per adjacent water pixel in a 30x30 neighbourhood (coastal)
 *     +5 per river point within 30 px                      (riverbank)
 *     -100 if within 80 px of an existing city             (hard penalty)
 *     +0.1 per px of distance to nearest city, capped at +20
 *   Only cities with a final score > -50 are kept.
 */
export function generateCities(
    cfg: CityMapConfig,
    heightMap: Float32Array,
    rivers: readonly SimpleRiverLike[],
    rng: RngLike,
    names: NameGenerator,
    loreHints: LoreHintsForCities | null,
): CityRecord[] {
    const { width, height, seaLevel, mountainLevel, cityCount } = cfg;
    const cities: CityRecord[] = [];

    // Phase 1: lore cities (priority)
    if (loreHints && loreHints.cities.length > 0) {
        for (const loreCity of loreHints.cities) {
            let cx: number;
            let cy: number;

            if (loreCity.relX !== null && loreCity.relY !== null) {
                cx = Math.floor((loreCity.relX ?? 0) * width);
                cy = Math.floor((loreCity.relY ?? 0) * height);
            } else if (loreCity.regionId) {
                const region = loreHints.regions.find(r => r.id === loreCity.regionId);
                if (region) {
                    cx = Math.floor(region.relX * width + rng.nextFloat(-40, 40));
                    cy = Math.floor(region.relY * height + rng.nextFloat(-40, 40));
                } else {
                    cx = rng.nextInt(Math.floor(width * 0.1), Math.floor(width * 0.9));
                    cy = rng.nextInt(Math.floor(height * 0.1), Math.floor(height * 0.9));
                }
            } else {
                // Random land spot with a few retry attempts
                cx = rng.nextInt(Math.floor(width * 0.1), Math.floor(width * 0.9));
                cy = rng.nextInt(Math.floor(height * 0.1), Math.floor(height * 0.9));
                for (let attempt = 0; attempt < 50; attempt++) {
                    const h = heightMap[cy * width + cx];
                    if (h > seaLevel + 0.02 && h < mountainLevel * 0.85) break;
                    cx = rng.nextInt(Math.floor(width * 0.1), Math.floor(width * 0.9));
                    cy = rng.nextInt(Math.floor(height * 0.1), Math.floor(height * 0.9));
                }
            }

            // Clamp into the drawable area (with a small margin)
            cx = clamp(cx, 10, width - 10);
            cy = clamp(cy, 10, height - 10);

            // Snap to land if the chosen pixel is underwater
            const h = heightMap[clamp(cy, 0, height - 1) * width + clamp(cx, 0, width - 1)];
            if (h < seaLevel) {
                // Spiral-search outward for the first land pixel
                searchLoop: for (let r = 5; r < 60; r += 5) {
                    for (let a = 0; a < Math.PI * 2; a += 0.5) {
                        const nx = clamp(Math.floor(cx + Math.cos(a) * r), 0, width - 1);
                        const ny = clamp(Math.floor(cy + Math.sin(a) * r), 0, height - 1);
                        if (heightMap[ny * width + nx] > seaLevel + 0.02) {
                            cx = nx;
                            cy = ny;
                            break searchLoop;
                        }
                    }
                }
            }

            // Lore-sized categories collapsed to our internal small/medium/large
            const sizeMap: Record<string, 'small' | 'medium' | 'large'> = {
                village: 'small',
                town: 'small',
                city: 'medium',
                metropolis: 'large',
                capital: 'large',
            };
            cities.push({
                x: cx,
                y: cy,
                name: loreCity.name,
                size: sizeMap[loreCity.size ?? ''] ?? 'medium',
                style: loreCity.style ?? 'human',
                isCapital: loreCity.isCapital ?? false,
                loreId: loreCity.id,
                description: loreCity.description,
                fromLore: true,
            });
        }
    }

    // Phase 2: fill remaining slots procedurally
    const remainingCount = Math.max(0, cityCount - cities.length);
    for (let i = 0; i < remainingCount; i++) {
        let bestX = 0;
        let bestY = 0;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < 100; attempt++) {
            const x = rng.nextInt(Math.floor(width * 0.08), Math.floor(width * 0.92));
            const y = rng.nextInt(Math.floor(height * 0.08), Math.floor(height * 0.92));
            const h = heightMap[y * width + x];

            // Not on water and not on mountains
            if (h < seaLevel + 0.02 || h > mountainLevel * 0.85) continue;

            let score = 0;

            // Coastal bonus: count water neighbours in a 7x7 sample
            for (let dy = -15; dy <= 15; dy += 5) {
                for (let dx = -15; dx <= 15; dx += 5) {
                    const nx = clamp(x + dx, 0, width - 1);
                    const ny = clamp(y + dy, 0, height - 1);
                    if (heightMap[ny * width + nx] < seaLevel) score += 2;
                }
            }

            // River proximity bonus
            for (const river of rivers) {
                for (const pt of river) {
                    const d = distance(x, y, pt.x, pt.y);
                    if (d < 30) score += 5;
                }
            }

            // Keep cities apart
            let minCityDist = Infinity;
            for (const city of cities) {
                const d = distance(x, y, city.x, city.y);
                if (d < minCityDist) minCityDist = d;
            }
            if (minCityDist < 80) score -= 100;
            else score += Math.min(minCityDist * 0.1, 20);

            if (score > bestScore) {
                bestScore = score;
                bestX = x;
                bestY = y;
            }
        }

        if (bestScore > -50) {
            // The very first procedural city (when there are no lore
            // cities) is crowned capital
            const isCapital = cities.length === 0 && i === 0;
            cities.push({
                x: bestX,
                y: bestY,
                name: names.generate('city'),
                size: isCapital ? 'large' : (rng.next() > 0.6 ? 'medium' : 'small'),
                isCapital,
                fromLore: false,
            });
        }
    }

    return cities;
}

// ── City rendering ─────────────────────────────────────────────────

/**
 * Colored / parchment / Wonderdraft city renderer.
 * Capitals and large cities get a castle icon (with asset fallback),
 * smaller settlements get a filled circle.
 */
export function renderCities(
    ctx: CanvasRenderingContext2D,
    _cfg: CityMapConfig,
    cities: readonly CityRecord[],
): void {
    for (const city of cities) {
        if (city.isCapital || city.size === 'large') {
            const variantSeed = (city.x * 2654435761) ^ (city.y * 1597334677);
            drawCastleSmart(ctx, city.x, city.y, 18, variantSeed);
        } else {
            const s = city.size === 'medium' ? 6 : 4;
            ctx.fillStyle = '#2a1a0a';
            ctx.beginPath();
            ctx.arc(city.x, city.y, s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f4e4c1';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

/** Book-style variant of renderCities using hand-drawn icons. */
export function renderBookCities(
    ctx: CanvasRenderingContext2D,
    _cfg: CityMapConfig,
    cities: readonly CityRecord[],
): void {
    for (const city of cities) {
        const size = city.isCapital || city.size === 'large'
            ? 16
            : city.size === 'medium' ? 11 : 8;
        drawBookCity(ctx, city.x, city.y, size, {
            isCapital: city.isCapital || city.size === 'large',
        });
    }
}

// ── Roads ──────────────────────────────────────────────────────────

/**
 * Draw roads between cities.
 *
 * If lore roads are provided they're drawn first with thicker line
 * weight and an italic label at the midpoint. Then every city gets a
 * nearest-neighbour connection to its closest sibling within 35% of
 * the map width, so isolated cities still get a visible route without
 * the whole map drowning in lines.
 */
export function renderRoads(
    ctx: CanvasRenderingContext2D,
    cfg: CityMapConfig,
    cities: readonly CityRecord[],
    _heightMap: Float32Array,
    loreHints: LoreHintsForCities | null,
): void {
    if (cities.length < 2) return;

    const isBook = cfg.mapStyle === 'book';
    ctx.strokeStyle = isBook
        ? 'rgba(35, 25, 15, 0.45)'
        : cfg.mapStyle === 'parchment' ? PALETTES.parchment.road : '#8a7a5a';
    ctx.lineWidth = isBook ? 1 : 1.5;
    ctx.setLineDash(isBook ? [3, 5] : [4, 4]);

    // Phase 1: lore-defined named roads (thicker, labelled)
    if (loreHints && loreHints.roads.length > 0) {
        ctx.save();
        ctx.lineWidth = isBook ? 1.5 : 2.5;
        ctx.setLineDash(isBook ? [4, 4] : [6, 3]);
        ctx.strokeStyle = isBook
            ? 'rgba(35, 25, 15, 0.5)'
            : cfg.mapStyle === 'parchment' ? '#6a5a4a' : '#7a6a4a';

        for (const road of loreHints.roads) {
            const fromCity = cities.find(c => c.loreId === road.fromCityId || c.name === road.fromCityId);
            const toCity = cities.find(c => c.loreId === road.toCityId || c.name === road.toCityId);
            if (!fromCity || !toCity) continue;

            ctx.beginPath();
            ctx.moveTo(fromCity.x, fromCity.y);
            const midX = (fromCity.x + toCity.x) / 2 + (Math.random() - 0.5) * 30;
            const midY = (fromCity.y + toCity.y) / 2 + (Math.random() - 0.5) * 30;
            ctx.quadraticCurveTo(midX, midY, toCity.x, toCity.y);
            ctx.stroke();

            if (road.name) {
                ctx.save();
                ctx.font = 'italic 8px "Palatino Linotype", serif';
                ctx.fillStyle = cfg.mapStyle === 'parchment' ? '#5a4a3a' : '#6a5a3a';
                ctx.textAlign = 'center';
                ctx.fillText(road.name, midX, midY - 6);
                ctx.restore();
            }
        }
        ctx.restore();

        // Reset style for the procedural phase
        ctx.strokeStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.road : '#8a7a5a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
    }

    // Phase 2: nearest-neighbour procedural roads
    for (let i = 0; i < cities.length; i++) {
        let closest: CityRecord | null = null;
        let closestDist = Infinity;

        for (let j = 0; j < cities.length; j++) {
            if (i === j) continue;
            const d = distance(cities[i].x, cities[i].y, cities[j].x, cities[j].y);
            if (d < closestDist && d < cfg.width * 0.35) {
                closestDist = d;
                closest = cities[j];
            }
        }

        if (closest) {
            ctx.beginPath();
            ctx.moveTo(cities[i].x, cities[i].y);
            const midX = (cities[i].x + closest.x) / 2 + (Math.random() - 0.5) * 20;
            const midY = (cities[i].y + closest.y) / 2 + (Math.random() - 0.5) * 20;
            ctx.quadraticCurveTo(midX, midY, closest.x, closest.y);
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
}

// ── Labels ─────────────────────────────────────────────────────────

/** Draw city and river name labels on the map. */
export function renderLabels(
    ctx: CanvasRenderingContext2D,
    cfg: CityMapConfig,
    cities: readonly CityRecord[],
    rivers: readonly SimpleRiverLike[],
    names: NameGenerator,
    _rng: RngLike,
): void {
    const isBook = cfg.mapStyle === 'book';
    const isParchment = cfg.mapStyle === 'parchment' || isBook;
    const textColor = isParchment ? 'rgba(35, 25, 15, 0.9)' : '#1a1a1a';
    const shadowColor = isBook
        ? 'transparent'
        : isParchment ? 'transparent' : 'rgba(255,255,255,0.7)';

    // City labels
    for (const city of cities) {
        const fontSize = city.isCapital ? 14 : city.size === 'medium' ? 11 : 9;
        ctx.font = `${city.isCapital ? 'bold ' : ''}${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        if (shadowColor !== 'transparent') {
            ctx.strokeStyle = shadowColor;
            ctx.lineWidth = 3;
            ctx.strokeText(city.name, city.x, city.y + (city.isCapital ? 14 : 8));
        }

        ctx.fillStyle = textColor;
        ctx.fillText(city.name, city.x, city.y + (city.isCapital ? 14 : 8));
    }

    // River labels (italic, following the flow direction)
    for (const river of rivers) {
        if (river.length < 10) continue;
        const midIdx = Math.floor(river.length * 0.4);
        const pt = river[midIdx];
        const riverName = names.generate('river');

        ctx.save();
        ctx.font = 'italic 9px "Palatino Linotype", serif';
        ctx.fillStyle = isParchment ? PALETTES.parchment.water : '#2a5a8a';
        ctx.textAlign = 'center';

        const nextPt = river[Math.min(midIdx + 3, river.length - 1)];
        const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
        ctx.translate(pt.x, pt.y);
        ctx.rotate(angle);
        ctx.fillText(riverName, 0, -5);
        ctx.restore();
    }
}

// ── Title ──────────────────────────────────────────────────────────

/**
 * Render the map title and subtitle. Uses the lore world name and
 * description if the user has imported a lore file; otherwise falls
 * back to "Calyndra / Eine Fantasywelt".
 */
export function renderTitle(
    ctx: CanvasRenderingContext2D,
    cfg: CityMapConfig,
    _names: NameGenerator,
    loreHints: LoreHintsForCities | null,
): void {
    const title = loreHints?.worldName ?? 'Calyndra';
    const subtitle = loreHints?.worldDescription
        ? `~ ${loreHints.worldDescription.slice(0, 60)}${loreHints.worldDescription.length > 60 ? '...' : ''} ~`
        : '~ Eine Fantasywelt ~';
    const fontSize = Math.max(20, cfg.width * 0.025);

    ctx.font = `bold ${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const x = cfg.width / 2;
    const y = cfg.height * 0.02 + 15;

    // Soft white halo
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeText(title, x, y);

    // Title fill
    ctx.fillStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.ink : '#1a1a0a';
    ctx.fillText(title, x, y);

    // Subtitle
    ctx.font = `italic ${fontSize * 0.5}px "Palatino Linotype", serif`;
    ctx.fillText(subtitle, x, y + fontSize + 4);
}
