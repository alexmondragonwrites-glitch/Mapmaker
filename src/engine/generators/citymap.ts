/**
 * Calyndra Mapmaker - City Map Generator
 * Generates detailed fantasy city layouts with districts, buildings, walls, and landmarks
 */

import { SimplexNoise } from '../noise';
import { NameGenerator, PALETTES, SeededRandom, clamp, distance } from '../../utils';
import {
    drawHumanHouse, drawElvenHouse, drawDwarvenHouse,
    drawTower, drawTemple, drawTavern, drawCastle, drawTree, drawMapBorder,
    drawForge, drawChurch, drawGuildHall, drawWarehouse,
    drawWell, drawFountain, drawMarketStall, drawWindmill,
    drawStatue, drawBarracks, drawLibrary, drawDock,
    drawShack, drawNobleHouse, drawShrine,
} from '../assets';
import { tryDrawAsset } from '../assets-runtime/bridge';
import type { AssetCategory } from '../assets-runtime';
// Package C1: layout primitives (outline, gates, districts, walls, roads, bridges)
// live in their own module. citymap.ts orchestrates; layout.ts owns geometry.
import {
    getCityRadius,
    generateCityOutline,
    computeGates,
    generateDistricts,
    renderDistrictGrounds,
    renderWalls,
    generateRoads,
    renderRoads,
    renderBridges,
} from './citymap/layout';

// Map procedural draw functions to their asset category, so the bridge
// can look up PNG variants if the user has installed an asset pack.
const DRAW_FN_CATEGORY = new Map<Function, AssetCategory>([
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
 * category, otherwise fall back to the procedural function.
 */
function drawBuildingSmart(
    ctx: any,
    drawFn: Function,
    x: number,
    y: number,
    size: number,
    seed: number,
): void {
    const category = DRAW_FN_CATEGORY.get(drawFn);
    if (category && tryDrawAsset(ctx, category, x, y, size, seed)) return;
    (drawFn as any)(ctx, x, y, size);
}

// ── District Building Mix Definitions ───────────────────────────────
// Each district type has a weighted list of buildings it spawns.
// weight = how often this building appears relative to others in the same district.

type BuildingDrawFn = (ctx: any, x: number, y: number, size: number, options?: any) => void;

interface BuildingEntry {
    draw: BuildingDrawFn;
    weight: number;
    sizeMin: number;
    sizeMax: number;
}

interface DistrictProfile {
    buildings: BuildingEntry[];
    density: number;      // building count multiplier (1.0 = normal)
    spacing: number;      // min distance between buildings in px
    groundTint: string;   // overlay color for the district ground
    groundAlpha: number;  // opacity of the ground tint
}

const DISTRICT_PROFILES: Record<string, DistrictProfile> = {
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

// Pick a weighted building from a district profile
function pickBuilding(profile: DistrictProfile, rng: any): BuildingEntry {
    const totalWeight = profile.buildings.reduce((s, b) => s + b.weight, 0);
    let roll = rng.next() * totalWeight;
    for (const entry of profile.buildings) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    return profile.buildings[0];
}

// Lore integration - set externally
let _loreManager = null;
export function setCityMapLore(lore) { _loreManager = lore; }

export class CityMapGenerator {
    static id = 'citymap';
    static label = 'Stadtkarte';
    static icon = '🏰';

    constructor() {
        this.defaultConfig = {
            seed: Math.floor(Math.random() * 100000),
            width: 1200,
            height: 900,
            citySize: 'medium',       // small | medium | large | metropolis
            style: 'human',           // human | elven | dwarven | mixed
            mapStyle: 'natural',      // natural | wonderdraft (matches worldmap)
            hasWalls: true,
            hasRiver: true,
            hasCastle: true,
            districtCount: 5,
            buildingDensity: 0.7,
            showLabels: true,
            showBorder: true,
        };
    }

    getControls() {
        return [
            { type: 'number', key: 'seed', label: 'Seed', min: 0, max: 999999 },
            { type: 'select', key: 'width', label: 'Breite', options: [
                { value: 800, label: '800px' }, { value: 1200, label: '1200px' },
                { value: 1920, label: '1920px (HD)' }, { value: 3840, label: '3840px (4K)' },
            ]},
            { type: 'select', key: 'height', label: 'Höhe', options: [
                { value: 600, label: '600px' }, { value: 900, label: '900px' },
                { value: 1080, label: '1080px (HD)' }, { value: 2160, label: '2160px (4K)' },
            ]},
            { type: 'select', key: 'citySize', label: 'Stadtgröße', options: [
                { value: 'small', label: 'Klein (Dorf)' },
                { value: 'medium', label: 'Mittel (Stadt)' },
                { value: 'large', label: 'Groß (Großstadt)' },
                { value: 'metropolis', label: 'Metropole' },
            ]},
            { type: 'select', key: 'style', label: 'Baustil', options: [
                { value: 'human', label: 'Menschen' },
                { value: 'elven', label: 'Elfen' },
                { value: 'dwarven', label: 'Zwerge' },
                { value: 'mixed', label: 'Gemischt' },
            ]},
            { type: 'select', key: 'mapStyle', label: 'Kartenstil', options: [
                { value: 'natural', label: 'Natürlich' },
                { value: 'wonderdraft', label: 'Wonderdraft (für Assets)' },
            ]},
            { type: 'checkbox', key: 'hasWalls', label: 'Stadtmauer' },
            { type: 'checkbox', key: 'hasRiver', label: 'Fluss' },
            { type: 'checkbox', key: 'hasCastle', label: 'Burg/Schloss' },
            { type: 'range', key: 'districtCount', label: 'Bezirke', min: 2, max: 10, step: 1 },
            { type: 'range', key: 'buildingDensity', label: 'Gebäudedichte', min: 0.3, max: 1.0, step: 0.1 },
            { type: 'checkbox', key: 'showLabels', label: 'Beschriftungen' },
            { type: 'checkbox', key: 'showBorder', label: 'Kartenrand' },
        ];
    }

    generate(canvas, config = {}) {
        const cfg = { ...this.defaultConfig, ...config };

        // Apply lore hints if a lore city ID is set
        if (cfg.loreCityId && _loreManager) {
            const hints = _loreManager.getCityMapHints(cfg.loreCityId);
            if (hints) {
                cfg.citySize = hints.size || cfg.citySize;
                cfg.style = hints.style || cfg.style;
                cfg.hasWalls = hints.hasWalls ?? cfg.hasWalls;
                cfg.hasRiver = hints.hasRiver ?? cfg.hasRiver;
                cfg.hasCastle = hints.hasCastle ?? cfg.hasCastle;
                cfg._loreName = hints.name;
                cfg._loreDistricts = hints.districts;
                cfg._loreNPCs = hints.npcs;
                cfg._loreFaction = hints.faction;
            }
        }

        canvas.width = cfg.width;
        canvas.height = cfg.height;
        const ctx = canvas.getContext('2d');

        const noise = new SimplexNoise(cfg.seed);
        const rng = new SeededRandom(cfg.seed);
        const names = new NameGenerator(cfg.seed);

        const cityName = cfg._loreName || names.generate('city');
        // Package C1: layout primitives live in citymap/layout.ts now.
        // This class just wires them up with the local rng/noise/config.
        const cityRadius = getCityRadius(cfg);
        const centerX = cfg.width / 2;
        const centerY = cfg.height / 2;

        // Generate organic city outline (noise-deformed polygon).
        // Replaces the old "perfect circle with tiny wobble" approach.
        // The outline is used for walls, district containment, and gate placement.
        const outline = generateCityOutline(centerX, centerY, cityRadius, cfg.seed, noise);

        // Compute gate positions once so walls, roads and countryside agree
        const gates = computeGates(outline);

        // Background - grass/terrain (sets cfg._biome)
        this._renderBackground(ctx, cfg, noise);

        // Countryside features (farms, fields, outbound roads from gates)
        // - drawn on top of the background but under the river, districts and walls
        this._renderCountryside(ctx, cfg, outline, gates, centerX, centerY, rng);

        // River
        let riverPoints = [];
        if (cfg.hasRiver) {
            riverPoints = this._generateRiver(cfg, rng);
            this._renderRiver(ctx, cfg, riverPoints);
        }

        // Generate districts organically inside the outline
        const districts = generateDistricts(cfg, rng, outline, riverPoints);

        // District ground tinting (under walls and roads).
        // We pass a `tintOf` callback so layout.ts doesn't need to import
        // DISTRICT_PROFILES (which currently lives here, will move in C3).
        renderDistrictGrounds(ctx, districts, (type) => {
            const profile = DISTRICT_PROFILES[type];
            return profile ? { hex: profile.groundTint, alpha: profile.groundAlpha } : null;
        });

        // City walls (follow the organic outline)
        if (cfg.hasWalls) {
            renderWalls(ctx, outline, gates);
        }

        // Organic road network: gates on the outline, curved main roads,
        // plus branching secondary streets
        const roads = generateRoads(outline, rng);
        renderRoads(ctx, roads);

        // Bridges where roads cross the river
        if (cfg.hasRiver && riverPoints.length > 0) {
            renderBridges(ctx, roads, riverPoints);
        }

        // Buildings per district
        this._renderBuildings(ctx, cfg, districts, roads, riverPoints, outline, rng, noise);

        // Landmarks
        this._renderLandmarks(ctx, cfg, centerX, centerY, cityRadius, rng, names, districts);

        // Castle
        if (cfg.hasCastle) {
            drawCastle(ctx, centerX, centerY - cityRadius * 0.3, Math.max(24, cityRadius * 0.12));
        }

        // Surrounding trees
        this._renderSurroundingTrees(ctx, cfg, centerX, centerY, cityRadius, rng);

        // Labels
        if (cfg.showLabels) {
            this._renderLabels(ctx, cfg, districts, cityName, centerX, centerY);
        }

        // Border
        if (cfg.showBorder) {
            drawMapBorder(ctx, cfg.width, cfg.height, 'ornate');
        }
    }

    /**
     * Determine a terrain biome for the city's surroundings based on the seed.
     * Different biomes use different base colors, noise patterns and accents,
     * so no two cities have the same landscape.
     */
    _getTerrainBiome(seed) {
        // Pick one of 6 biomes deterministically from the seed.
        // Use a different seed slice than the one used for the city shape so
        // shape and biome are decoupled.
        const biomes = ['plains', 'forest_edge', 'hills', 'coastal', 'marsh', 'steppe'];
        const idx = Math.abs(Math.floor(seed * 0.00007)) % biomes.length;
        return biomes[idx];
    }

    /**
     * Per-biome background palette and noise settings. Each entry returns an
     * RGB triplet given a noise value [0..1] and the (x,y) coordinates.
     */
    _biomeColor(biome, n, moisture, mapStyle = 'natural') {
        // Wonderdraft palette: warm, muted, matches the hand-drawn asset
        // look from commercial fantasy packs. No saturated greens.
        if (mapStyle === 'wonderdraft') {
            return this._biomeColorWonderdraft(biome, n, moisture);
        }
        switch (biome) {
            case 'plains':
                // Lush green meadowland
                return {
                    r: 82 + n * 34,
                    g: 128 + n * 38,
                    b: 52 + n * 22,
                };
            case 'forest_edge':
                // Dark mossy green with brown undergrowth
                return {
                    r: 55 + n * 25 + moisture * 15,
                    g: 92 + n * 28,
                    b: 40 + n * 18,
                };
            case 'hills':
                // Golden-green rolling hills with dry grass accents
                return {
                    r: 130 + n * 45,
                    g: 140 + n * 35,
                    b: 65 + n * 20,
                };
            case 'coastal':
                // Sandy dune-grass mix near the coast
                return {
                    r: 155 + n * 40,
                    g: 150 + n * 30,
                    b: 85 + n * 20,
                };
            case 'marsh':
                // Olive-yellow wetland with darker water patches
                return {
                    r: 88 + n * 25 - moisture * 20,
                    g: 105 + n * 25 - moisture * 10,
                    b: 55 + n * 15 + moisture * 25,
                };
            case 'steppe':
                // Dry pale-yellow grassland
                return {
                    r: 175 + n * 40,
                    g: 160 + n * 35,
                    b: 95 + n * 25,
                };
            default:
                return { r: 95, g: 138, b: 62 };
        }
    }

    /**
     * Wonderdraft-matching palette for the city background. All biomes
     * render as warm cream / sage tones so the hand-drawn asset stamps
     * contrast cleanly against them. The biome still affects hue
     * slightly (a marsh reads cooler than a steppe) but never gets
     * saturated enough to fight the assets.
     */
    _biomeColorWonderdraft(biome, n, moisture) {
        switch (biome) {
            case 'plains':
                return {
                    r: 190 + n * 24,
                    g: 192 + n * 22,
                    b: 130 + n * 18,
                };
            case 'forest_edge':
                return {
                    r: 172 + n * 22 + moisture * 8,
                    g: 178 + n * 22,
                    b: 118 + n * 16,
                };
            case 'hills':
                return {
                    r: 202 + n * 28,
                    g: 194 + n * 24,
                    b: 128 + n * 18,
                };
            case 'coastal':
                return {
                    r: 212 + n * 22,
                    g: 200 + n * 18,
                    b: 148 + n * 14,
                };
            case 'marsh':
                return {
                    r: 168 + n * 20 - moisture * 10,
                    g: 172 + n * 18 - moisture * 6,
                    b: 122 + n * 14 + moisture * 14,
                };
            case 'steppe':
                return {
                    r: 216 + n * 24,
                    g: 204 + n * 20,
                    b: 142 + n * 16,
                };
            default:
                return { r: 196, g: 190, b: 134 };
        }
    }

    _renderBackground(ctx, cfg, noise) {
        const { width, height } = cfg;
        const biome = this._getTerrainBiome(cfg.seed);
        cfg._biome = biome; // stash for later passes (trees, features)

        // Use two noise layers: large-scale variation for terrain and a
        // separate moisture layer for ponds, patches, etc.
        const noise2 = new SimplexNoise(cfg.seed + 4711);
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Larger scale than before for more visible terrain variation
                const n = (noise.fbm(x / 220, y / 220, 4) + 1) * 0.5;
                // Moisture / patch layer at a different frequency so it
                // doesn't line up with the main noise
                const m = (noise2.fbm(x / 110, y / 110, 3) + 1) * 0.5;

                const color = this._biomeColor(biome, n, m, cfg.mapStyle);

                const pi = (y * width + x) * 4;
                data[pi]     = Math.max(0, Math.min(255, color.r));
                data[pi + 1] = Math.max(0, Math.min(255, color.g));
                data[pi + 2] = Math.max(0, Math.min(255, color.b));
                data[pi + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    _generateRiver(cfg, rng) {
        const { width, height } = cfg;
        const points = [];
        const startSide = rng.nextInt(0, 1); // 0 = left-right, 1 = top-bottom

        if (startSide === 0) {
            let y = height * rng.nextFloat(0.3, 0.7);
            for (let x = 0; x <= width; x += 8) {
                y += rng.nextFloat(-5, 5);
                y = clamp(y, height * 0.15, height * 0.85);
                points.push({ x, y });
            }
        } else {
            let x = width * rng.nextFloat(0.3, 0.7);
            for (let y = 0; y <= height; y += 8) {
                x += rng.nextFloat(-5, 5);
                x = clamp(x, width * 0.15, width * 0.85);
                points.push({ x, y });
            }
        }

        return points;
    }

    _renderRiver(ctx, cfg, points) {
        if (points.length < 2) return;

        // River body
        ctx.save();
        ctx.strokeStyle = PALETTES.city.water;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();

        // Lighter center
        ctx.strokeStyle = '#6aa0c0';
        ctx.lineWidth = 12;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Countryside features outside the walls: outbound roads from each gate,
     * farmland plots along those roads, scattered farmsteads, small ponds.
     * Drawn after the background and before the river/districts so the
     * city proper covers the countryside cleanly.
     */
    _renderCountryside(ctx, cfg, outline, gates, centerX, centerY, rng) {
        const { width, height } = cfg;
        const biome = cfg._biome || 'plains';
        const isFarmland = biome !== 'marsh' && biome !== 'steppe';

        // ── Outbound roads from gates ──
        // Each gate gets a road that leaves the city radially outward and
        // wanders off toward the nearest map edge with a slight curve.
        ctx.save();
        for (const gate of gates) {
            // Direction: from city center through gate, then extend outward
            const dx = gate.x - centerX;
            const dy = gate.y - centerY;
            const len = Math.hypot(dx, dy);
            if (len < 1) continue;
            const nx = dx / len;
            const ny = dy / len;

            // Start just outside the wall; end off the map edge
            const startX = gate.x + nx * 4;
            const startY = gate.y + ny * 4;
            const maxDist = Math.max(width, height);
            const endX = gate.x + nx * maxDist;
            const endY = gate.y + ny * maxDist;

            // Curve with a perpendicular offset at the midpoint
            const midX = (startX + endX) / 2 + (-ny) * rng.nextFloat(-40, 40);
            const midY = (startY + endY) / 2 + ( nx) * rng.nextFloat(-40, 40);

            // Shadow
            ctx.strokeStyle = 'rgba(40, 30, 20, 0.25)';
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(midX, midY, endX, endY);
            ctx.stroke();

            // Road surface
            ctx.strokeStyle = PALETTES.city.road;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(midX, midY, endX, endY);
            ctx.stroke();
        }
        ctx.restore();

        // ── Farmland plots ──
        // Square-ish patches of tilled earth along the outbound roads,
        // only in biomes where agriculture makes sense.
        if (isFarmland) {
            ctx.save();
            for (const gate of gates) {
                const dx = gate.x - centerX;
                const dy = gate.y - centerY;
                const len = Math.hypot(dx, dy);
                if (len < 1) continue;
                const nx = dx / len;
                const ny = dy / len;
                // Perpendicular direction
                const px = -ny;
                const py = nx;

                // 3-5 plots per gate, at stepped distances outside the walls
                const plotCount = rng.nextInt(3, 5);
                for (let i = 0; i < plotCount; i++) {
                    const forward = rng.nextFloat(30, 160);
                    const side = rng.nextFloat(-80, 80);
                    const px0 = gate.x + nx * forward + px * side;
                    const py0 = gate.y + ny * forward + py * side;

                    // Skip if outside the canvas or inside the city
                    if (px0 < 10 || px0 > width - 10 || py0 < 10 || py0 > height - 10) continue;
                    if (outline.containsPoint(px0, py0, -20)) continue;

                    // Plot dimensions
                    const w = rng.nextFloat(30, 55);
                    const h = rng.nextFloat(22, 40);
                    // Rotate plot roughly along the road direction
                    const angle = Math.atan2(ny, nx) + rng.nextFloat(-0.3, 0.3);

                    ctx.save();
                    ctx.translate(px0, py0);
                    ctx.rotate(angle);

                    // Tilled earth background
                    const earthColors = ['#7a5a3a', '#8a6a4a', '#6a4a2a', '#9a7a5a'];
                    ctx.fillStyle = earthColors[rng.nextInt(0, earthColors.length - 1)];
                    ctx.fillRect(-w / 2, -h / 2, w, h);

                    // Furrow lines
                    ctx.strokeStyle = 'rgba(40, 25, 10, 0.35)';
                    ctx.lineWidth = 0.8;
                    const furrows = Math.max(3, Math.floor(h / 6));
                    for (let f = 1; f < furrows; f++) {
                        const fy = -h / 2 + (h / furrows) * f;
                        ctx.beginPath();
                        ctx.moveTo(-w / 2 + 2, fy);
                        ctx.lineTo(w / 2 - 2, fy);
                        ctx.stroke();
                    }

                    // Dark plot border
                    ctx.strokeStyle = 'rgba(30, 20, 10, 0.6)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(-w / 2, -h / 2, w, h);

                    ctx.restore();
                }
            }
            ctx.restore();
        }

        // ── Farmsteads / outbuildings ──
        // Small human houses scattered in the countryside, biased toward
        // the outbound roads. Marsh/steppe biomes get fewer.
        const farmCount = isFarmland ? rng.nextInt(6, 12) : rng.nextInt(1, 4);
        for (let i = 0; i < farmCount; i++) {
            // Pick a random gate and place near its outbound corridor
            const gate = gates[rng.nextInt(0, gates.length - 1)];
            const dx = gate.x - centerX;
            const dy = gate.y - centerY;
            const len = Math.hypot(dx, dy);
            if (len < 1) continue;
            const nx = dx / len;
            const ny = dy / len;
            const px = -ny;
            const py = nx;

            const forward = rng.nextFloat(50, 220);
            const side = rng.nextFloat(-110, 110);
            const fx = gate.x + nx * forward + px * side;
            const fy = gate.y + ny * forward + py * side;

            if (fx < 15 || fx > width - 15 || fy < 15 || fy > height - 15) continue;
            if (outline.containsPoint(fx, fy, -30)) continue;

            drawHumanHouse(ctx, fx, fy, rng.nextFloat(9, 13));
        }

        // ── Small ponds ──
        // A couple of round pond patches, only in wet biomes
        if (biome === 'marsh' || biome === 'plains' || biome === 'forest_edge') {
            const pondCount = biome === 'marsh' ? rng.nextInt(3, 6) : rng.nextInt(0, 2);
            ctx.save();
            for (let i = 0; i < pondCount; i++) {
                const pondX = rng.nextFloat(40, width - 40);
                const pondY = rng.nextFloat(40, height - 40);
                // Keep ponds away from the city
                if (Math.hypot(pondX - centerX, pondY - centerY) < outline.maxRadius * 1.3) continue;

                const r = rng.nextFloat(12, 28);
                // Blue water with a slight outline
                ctx.fillStyle = '#4a7aa0';
                ctx.beginPath();
                ctx.ellipse(pondX, pondY, r, r * rng.nextFloat(0.7, 1.0), rng.nextFloat(0, Math.PI), 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(30, 50, 70, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    /**
     * Place buildings along the roads on both sides, so they front onto
     * streets like real medieval towns. Each road segment spawns left and
     * right candidates offset perpendicular to the road direction. The
     * candidate's district is found by proximity, and the building type
     * comes from that district's profile.
     */
    _renderBuildings(ctx, cfg, districts, roads, riverPoints, outline, rng, _noise) {
        const { buildingDensity, style } = cfg;

        // Global placed list so buildings from different roads don't overlap
        const placed: Array<{ x: number; y: number; r: number }> = [];

        // Helper: find the district whose radius contains (x, y), or
        // otherwise the nearest district within avgRadius * 0.8
        const findDistrict = (x: number, y: number) => {
            let best: any = null;
            let bestScore = Infinity;
            for (const d of districts) {
                const dd = Math.hypot(x - d.x, y - d.y);
                // Inside the district ring is best
                if (dd <= d.radius) {
                    const score = dd - d.radius; // more negative is better
                    if (score < bestScore) { bestScore = score; best = d; }
                } else if (bestScore === Infinity) {
                    // Fallback: nearest by distance
                    if (dd < best?.distance || !best) {
                        best = d;
                        best.distance = dd;
                    }
                }
            }
            return best;
        };

        // Helper: is (x, y) too close to any road segment?
        const isOnRoad = (x: number, y: number, margin: number) => {
            for (const road of roads) {
                for (const pt of road.points) {
                    if (Math.hypot(x - pt.x, y - pt.y) < margin) return true;
                }
            }
            return false;
        };

        // Helper: is (x, y) in the river?
        const isInRiver = (x: number, y: number, margin: number) => {
            for (const pt of riverPoints) {
                if (Math.hypot(x - pt.x, y - pt.y) < margin) return true;
            }
            return false;
        };

        // Walk each road. We sample points along the polyline at a fixed
        // stride and try to place a building on each side.
        for (const road of roads) {
            // Only frontage roads - skip the plaza ring which is too tight
            if (road.type === 'plaza') continue;

            // How far out from the road centerline to place buildings
            const offset = road.width / 2 + 9;

            // Stride between building candidates along the road.
            // Main roads can afford denser frontage than branches.
            const stride = road.type === 'main' ? 14 : 12;

            // Accumulated distance since last candidate
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
                    // Position along the segment at this stride
                    const t = (stride - acc) / segLen;
                    const cxOnRoad = a.x + segDx * (1 - t);
                    const cyOnRoad = a.y + segDy * (1 - t);

                    // Try both sides of the road
                    for (const side of [+1, -1]) {
                        // Perpendicular offset + small random jitter for irregularity
                        const jitter = rng.nextFloat(-2, 2);
                        const bx = cxOnRoad + px * side * offset + px * side * jitter;
                        const by = cyOnRoad + py * side * offset + py * side * jitter;

                        // Must be inside the city outline
                        if (!outline.containsPoint(bx, by, 6)) continue;

                        // Not on another road
                        if (isOnRoad(bx, by, 6)) continue;

                        // Not in the river
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

                        // Density gate: some spots are intentionally left empty
                        // to avoid wall-to-wall solid blocks of houses
                        if (rng.next() > buildingDensity * profile.density * 0.95) continue;

                        // Pick a building from the district profile
                        const entry = pickBuilding(profile, rng);
                        const size = rng.nextFloat(entry.sizeMin, entry.sizeMax);

                        // Culture style override for generic houses
                        let drawFn = entry.draw;
                        if (entry.draw === drawHumanHouse && style !== 'human') {
                            const effective = style === 'mixed'
                                ? rng.pick(['human', 'elven', 'dwarven'])
                                : style;
                            if (effective === 'elven')  drawFn = drawElvenHouse;
                            if (effective === 'dwarven') drawFn = drawDwarvenHouse;
                        }

                        const variantSeed = (Math.floor(bx) * 73856093) ^ (Math.floor(by) * 19349663);
                        drawBuildingSmart(ctx, drawFn, bx, by, size, variantSeed);
                        placed.push({ x: bx, y: by, r: profile.spacing });
                    }
                }
            }
        }

        // Second pass: fill the remaining interior of each district with
        // some background clutter (houses behind the main frontages), so
        // we don't have big empty blocks between parallel roads.
        for (const district of districts) {
            const profile = DISTRICT_PROFILES[district.type];
            if (!profile) continue;

            // How much background infill: scales with density
            const area = Math.PI * district.radius * district.radius;
            const targetCount = Math.floor((area / (profile.spacing * profile.spacing * 3)) * buildingDensity * profile.density);

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

                let drawFn = entry.draw;
                if (entry.draw === drawHumanHouse && style !== 'human') {
                    const effective = style === 'mixed'
                        ? rng.pick(['human', 'elven', 'dwarven'])
                        : style;
                    if (effective === 'elven')  drawFn = drawElvenHouse;
                    if (effective === 'dwarven') drawFn = drawDwarvenHouse;
                }

                const variantSeed = (Math.floor(bx) * 73856093) ^ (Math.floor(by) * 19349663);
                drawBuildingSmart(ctx, drawFn, bx, by, size, variantSeed);
                placed.push({ x: bx, y: by, r: profile.spacing });
                placedThis++;
            }
        }
    }

    _renderLandmarks(ctx, cfg, centerX, centerY, cityRadius, rng, names, districts) {
        // Place a signature landmark at the geometric center of each
        // district. This is in addition to the district-specific building
        // mix from Package 2, and sits on top so it's always visible.
        for (const district of districts) {
            const { x, y, type } = district;

            switch (type) {
                case 'markt': {
                    // Central market plaza with fountain
                    ctx.fillStyle = PALETTES.city.plaza;
                    ctx.beginPath();
                    ctx.ellipse(x, y, 32, 26, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(80, 60, 30, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    drawFountain(ctx, x, y, 20);
                    break;
                }

                case 'tempel': {
                    drawTemple(ctx, x, y, 28);
                    // Ring of shrines around the main temple
                    for (let i = 0; i < 4; i++) {
                        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
                        const sx = x + Math.cos(angle) * 34;
                        const sy = y + Math.sin(angle) * 34;
                        drawShrine(ctx, sx, sy, 12);
                    }
                    break;
                }

                case 'adel': {
                    // Noble plaza: fountain flanked by statues
                    ctx.fillStyle = 'rgba(192, 176, 140, 0.6)';
                    ctx.beginPath();
                    ctx.ellipse(x, y, 30, 24, 0, 0, Math.PI * 2);
                    ctx.fill();
                    drawFountain(ctx, x, y, 22);
                    drawStatue(ctx, x - 28, y, 14);
                    drawStatue(ctx, x + 28, y, 14);
                    break;
                }

                case 'garten': {
                    // Garden: central fountain surrounded by trees
                    drawFountain(ctx, x, y, 18);
                    for (let i = 0; i < 10; i++) {
                        const angle = rng.nextFloat(0, Math.PI * 2);
                        const dist = rng.nextFloat(15, 35);
                        drawTree(ctx, x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, rng.nextFloat(7, 10));
                    }
                    break;
                }

                case 'handwerk': {
                    // Anvil square: a well and a big forge as focal point
                    drawForge(ctx, x, y, 22);
                    drawWell(ctx, x - 30, y + 20, 14);
                    break;
                }

                case 'hafen': {
                    // Large warehouse at the center, tavern nearby
                    drawWarehouse(ctx, x, y, 24);
                    drawTavern(ctx, x + 34, y, 16);
                    break;
                }

                case 'akademie': {
                    // Academy: library flanked by tower and statue
                    drawLibrary(ctx, x, y, 26);
                    drawTower(ctx, x - 32, y, 18);
                    drawStatue(ctx, x + 32, y + 8, 14);
                    break;
                }

                case 'kaserne': {
                    // Parade ground: main barracks with watch tower
                    drawBarracks(ctx, x, y, 26);
                    drawTower(ctx, x - 34, y - 10, 18);
                    drawTower(ctx, x + 34, y - 10, 18);
                    break;
                }

                case 'wohn': {
                    // Simple neighborhood well
                    drawWell(ctx, x, y, 16);
                    break;
                }

                case 'armen': {
                    // Shared communal well
                    drawWell(ctx, x, y, 14);
                    break;
                }
            }
        }

        // Windmills at the city edges (outside walls, pointing out of districts)
        const windmillCount = cfg.citySize === 'metropolis' ? 3 : cfg.citySize === 'large' ? 2 : 1;
        for (let i = 0; i < windmillCount; i++) {
            const angle = rng.nextFloat(0, Math.PI * 2);
            const d = cityRadius * 1.12;
            const wx = centerX + Math.cos(angle) * d;
            const wy = centerY + Math.sin(angle) * d;
            drawWindmill(ctx, wx, wy, 20);
        }
    }

    /**
     * Scatter vegetation outside the city walls, biased by the biome
     * from Package E. Trees form small clumps via a secondary noise
     * field so we get actual "woods" instead of evenly-spread dots.
     */
    _renderSurroundingTrees(ctx, cfg, centerX, centerY, cityRadius, rng) {
        const { width, height } = cfg;
        const margin = 30;
        const biome = cfg._biome || 'plains';

        // Per-biome vegetation budget and mix
        const biomeConfig: Record<string, { density: number; pineMix: number }> = {
            plains:       { density: 160, pineMix: 0.25 },
            forest_edge:  { density: 520, pineMix: 0.55 },
            hills:        { density: 110, pineMix: 0.35 },
            coastal:      { density: 90,  pineMix: 0.15 },
            marsh:        { density: 70,  pineMix: 0.10 },
            steppe:       { density: 40,  pineMix: 0.05 },
        };
        const conf = biomeConfig[biome] || biomeConfig.plains;

        // Clump field: a low-frequency noise layer that determines
        // where trees are allowed to grow. High noise = small forest.
        const clumpNoise = new SimplexNoise(cfg.seed + 9000);

        let attempts = 0;
        let placed = 0;
        const target = conf.density;
        while (placed < target && attempts < target * 6) {
            attempts++;
            const x = rng.nextFloat(margin, width - margin);
            const y = rng.nextFloat(margin, height - margin);

            // Keep trees out of the city
            if (distance(x, y, centerX, centerY) < cityRadius * 1.15) continue;

            // Clump mask: normalized 0..1
            const clump = (clumpNoise.fbm(x / 120, y / 120, 3) + 1) * 0.5;

            // Biome-specific clump threshold
            let threshold;
            switch (biome) {
                case 'forest_edge': threshold = 0.30; break;  // mostly wooded
                case 'hills':       threshold = 0.52; break;  // sparse clumps
                case 'marsh':       threshold = 0.60; break;  // rare trees
                case 'steppe':      threshold = 0.75; break;  // very rare
                case 'coastal':     threshold = 0.55; break;
                default:            threshold = 0.45; break;  // plains
            }
            if (clump < threshold) continue;

            const type = rng.next() < conf.pineMix ? 'pine' : 'deciduous';
            const size = rng.nextFloat(6, 11);
            drawTree(ctx, x, y, size, { type });
            placed++;
        }
    }

    _renderLabels(ctx, cfg, districts, cityName, centerX, centerY) {
        // City title
        ctx.font = 'bold 22px "Palatino Linotype", "Book Antiqua", Palatino, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 4;
        ctx.strokeText(cityName, centerX, 20);
        ctx.fillStyle = '#2a1a0a';
        ctx.fillText(cityName, centerX, 20);

        // Faction subtitle (from lore)
        if (cfg._loreFaction) {
            ctx.font = 'italic 12px "Palatino Linotype", serif';
            ctx.fillStyle = '#5a4a3a';
            ctx.fillText(`${cfg._loreFaction.name}`, centerX, 46);
        }

        // District labels
        ctx.font = 'italic 10px "Palatino Linotype", serif';
        for (const district of districts) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 3;
            ctx.strokeText(district.name, district.x, district.y + district.radius * 0.5);
            ctx.fillStyle = '#3a2a1a';
            ctx.fillText(district.name, district.x, district.y + district.radius * 0.5);
        }

        // NPC markers (from lore)
        if (cfg._loreNPCs && cfg._loreNPCs.length > 0) {
            const rng = new SeededRandom(cfg.seed + 999);
            ctx.save();
            for (const npc of cfg._loreNPCs) {
                // Place NPCs in random district areas
                const d = districts[rng.nextInt(0, districts.length - 1)];
                const nx = d.x + rng.nextFloat(-d.radius * 0.4, d.radius * 0.4);
                const ny = d.y + rng.nextFloat(-d.radius * 0.4, d.radius * 0.4);

                // NPC marker
                ctx.fillStyle = '#aa8a2a';
                ctx.beginPath();
                ctx.arc(nx, ny, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#2a1a0a';
                ctx.lineWidth = 1;
                ctx.stroke();

                // NPC name
                ctx.font = 'bold 8px "Palatino Linotype", serif';
                ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 2;
                ctx.strokeText(npc.name, nx, ny - 8);
                ctx.fillStyle = '#4a2a0a';
                ctx.fillText(npc.name, nx, ny - 8);
            }
            ctx.restore();
        }
    }
}
