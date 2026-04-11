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
    drawShack, drawNobleHouse, drawShrine, drawBridge,
} from '../assets';

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
        const cityRadius = this._getCityRadius(cfg);
        const centerX = cfg.width / 2;
        const centerY = cfg.height / 2;

        // Generate organic city outline (noise-deformed polygon).
        // This replaces the old "perfect circle with tiny wobble" approach.
        // The outline is used for walls, district containment, and gate placement.
        const outline = this._generateCityOutline(centerX, centerY, cityRadius, cfg.seed, noise);

        // Background - grass/terrain
        this._renderBackground(ctx, cfg, noise);

        // River
        let riverPoints = [];
        if (cfg.hasRiver) {
            riverPoints = this._generateRiver(cfg, rng);
            this._renderRiver(ctx, cfg, riverPoints);
        }

        // Generate districts organically inside the outline (Package C)
        const districts = this._generateDistricts(cfg, rng, names, outline, riverPoints);

        // District ground tinting (under walls and roads)
        this._renderDistrictGrounds(ctx, districts);

        // City walls (follow the organic outline)
        if (cfg.hasWalls) {
            this._renderWalls(ctx, cfg, outline, rng);
        }

        // Organic road network: gates on the outline, curved main roads,
        // plus branching secondary streets
        const roads = this._generateRoads(cfg, outline, rng, districts);
        this._renderRoads(ctx, cfg, roads);

        // Bridges where roads cross the river
        if (cfg.hasRiver && riverPoints.length > 0) {
            this._renderBridges(ctx, roads, riverPoints);
        }

        // Buildings per district
        this._renderBuildings(ctx, cfg, districts, roads, riverPoints, centerX, centerY, cityRadius, rng, noise);

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

    _getCityRadius(cfg) {
        const base = Math.min(cfg.width, cfg.height) * 0.35;
        switch (cfg.citySize) {
            case 'small': return base * 0.5;
            case 'medium': return base * 0.7;
            case 'large': return base * 0.85;
            case 'metropolis': return base * 1.0;
            default: return base * 0.7;
        }
    }

    _renderBackground(ctx, cfg, noise) {
        const { width, height } = cfg;
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const n = (noise.fbm(x / 150, y / 150, 3) + 1) * 0.5;
                const pi = (y * width + x) * 4;

                const r = 70 + n * 40;
                const g = 120 + n * 30;
                const b = 50 + n * 20;

                data[pi] = r;
                data[pi + 1] = g;
                data[pi + 2] = b;
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
     * Place districts organically inside the city outline, respecting
     * semantic placement rules (harbor near river, barracks near an
     * edge, market near the heart, etc.) and enforcing Poisson-like
     * minimum spacing so districts don't overlap.
     */
    _generateDistricts(cfg, rng, _names, outline, riverPoints) {
        const districts: Array<any> = [];
        const districtTypes = ['markt', 'wohn', 'handwerk', 'adel', 'hafen', 'tempel', 'garten', 'armen', 'akademie', 'kaserne'];
        const districtNames: Record<string, string> = {
            markt: 'Marktviertel', wohn: 'Wohnviertel', handwerk: 'Handwerkerviertel',
            adel: 'Adelsviertel', hafen: 'Hafenviertel', tempel: 'Tempelviertel',
            garten: 'Gartenviertel', armen: 'Armenviertel', akademie: 'Akademieviertel',
            kaserne: 'Kasernenviertel'
        };

        const count = Math.min(cfg.districtCount, districtTypes.length);

        // Always try to include key districts first, then fill with random ones.
        // Market is the anchor and almost always appears.
        const priority = ['markt', 'tempel', 'wohn', 'handwerk', 'hafen', 'adel', 'kaserne', 'akademie', 'garten', 'armen'];
        const chosen = priority.slice(0, count);

        const cx = outline.cx;
        const cy = outline.cy;
        const avgR = outline.avgRadius;

        // Semantic placement preferences per district type:
        //   centerBias: how strongly this district is pulled toward the city heart
        //   edgeBias: how strongly it's pushed toward the outer walls
        //   riverBias: how strongly it wants to be near the river (if any)
        const prefs: Record<string, { centerBias: number; edgeBias: number; riverBias: number }> = {
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

        for (const type of chosen) {
            const p = prefs[type] || { centerBias: 0.4, edgeBias: 0.3, riverBias: 0 };

            // Try many candidate positions and pick the best according to
            // semantic preferences plus spacing from other districts.
            let bestX = cx;
            let bestY = cy;
            let bestScore = -Infinity;

            for (let attempt = 0; attempt < 60; attempt++) {
                // Sample a point inside the outline using polar coordinates
                const angle = rng.nextFloat(0, Math.PI * 2);
                // Distance from center biased by district preference
                const maxR = outline.radiusAt(angle) * 0.85;
                // t=0 -> center, t=1 -> edge
                let t;
                if (p.centerBias > p.edgeBias) {
                    // Favor center: square root biases toward small values
                    t = rng.nextFloat(0, 1) * rng.nextFloat(0, 1);
                } else {
                    // Favor edge: square biases toward large values
                    t = Math.sqrt(rng.nextFloat(0, 1));
                }
                const dist = t * maxR;
                const x = cx + Math.cos(angle) * dist;
                const y = cy + Math.sin(angle) * dist;

                // Score: start neutral, add/subtract based on preferences
                let score = 0;

                // Center preference
                const centerDist = Math.hypot(x - cx, y - cy);
                score += (1 - centerDist / avgR) * p.centerBias * 10;
                // Edge preference
                score += (centerDist / avgR) * p.edgeBias * 10;

                // River preference: distance to the nearest river point
                if (p.riverBias > 0 && riverPoints.length > 0) {
                    let minRiverDist = Infinity;
                    for (const rp of riverPoints) {
                        const d = Math.hypot(x - rp.x, y - rp.y);
                        if (d < minRiverDist) minRiverDist = d;
                    }
                    // Close to river = good
                    const normalized = Math.min(1, minRiverDist / avgR);
                    score += (1 - normalized) * p.riverBias * 12;
                }

                // Spacing: penalize being too close to existing districts
                let tooClose = false;
                for (const d of districts) {
                    const dd = Math.hypot(x - d.x, y - d.y);
                    const minSpacing = d.radius + avgR * 0.15;
                    if (dd < minSpacing) { tooClose = true; break; }
                    // Soft penalty: prefer spacing of avgR * 0.3
                    if (dd < avgR * 0.3) score -= (avgR * 0.3 - dd) * 0.5;
                }
                if (tooClose) continue;

                // Small random component so ties break randomly
                score += rng.nextFloat(0, 2);

                if (score > bestScore) {
                    bestScore = score;
                    bestX = x;
                    bestY = y;
                }
            }

            // Always place the district even if no ideal spot was found
            const radius = avgR * rng.nextFloat(0.18, 0.28);
            districts.push({
                x: bestX,
                y: bestY,
                type,
                name: districtNames[type],
                radius,
                angle: Math.atan2(bestY - cy, bestX - cx),
            });
        }

        return districts;
    }

    _renderDistrictGrounds(ctx, districts) {
        // Paint a soft radial tint under each district to visually separate
        // them. Drawn before walls/roads so those overlay the tints.
        ctx.save();
        for (const district of districts) {
            const profile = DISTRICT_PROFILES[district.type];
            if (!profile) continue;

            // Radial gradient: full tint at center, fading to nothing at edge
            const gradient = ctx.createRadialGradient(
                district.x, district.y, 0,
                district.x, district.y, district.radius * 1.15
            );

            // Parse hex color
            const hex = profile.groundTint;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            gradient.addColorStop(0,    `rgba(${r}, ${g}, ${b}, ${profile.groundAlpha})`);
            gradient.addColorStop(0.7,  `rgba(${r}, ${g}, ${b}, ${profile.groundAlpha * 0.5})`);
            gradient.addColorStop(1,    `rgba(${r}, ${g}, ${b}, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(district.x, district.y, district.radius * 1.15, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * Generate an organic city outline: a noise-deformed polygon centered
     * on (cx, cy) with a base radius of `baseRadius`. The deformation
     * combines several noise octaves plus a random directional stretch
     * so no two cities look the same and none of them look like a circle.
     *
     * Returns an object with:
     *  - points[]: the polygon vertices
     *  - cx, cy, baseRadius, avgRadius, maxRadius: bookkeeping
     *  - containsPoint(x, y): predicate to check if a point is inside
     *  - radiusAt(angle): the outline radius at a given angle
     */
    _generateCityOutline(cx, cy, baseRadius, seed, noise) {
        // Directional stretch: pick a preferred "growth axis" so cities are
        // elongated rather than perfectly round. Offsets come from the seed
        // so the same seed always produces the same city shape.
        const stretchAngle = ((seed * 0.0001) % 1) * Math.PI * 2;
        const stretchAmount = 0.15 + ((seed * 0.00013) % 1) * 0.25;  // 15-40%

        // Asymmetric blob radius: bigger in one half, smaller in the other
        const lobeAngle = stretchAngle + Math.PI * 0.5;
        const lobeStrength = 0.08 + ((seed * 0.00017) % 1) * 0.14;   // 8-22%

        // Number of outline samples - more = smoother
        const segments = 96;
        const points: Array<{ x: number; y: number; angle: number; r: number }> = [];

        // Precompute the radius function so we can reuse it
        const radiusAt = (angle: number) => {
            // Normalized direction vector for noise sampling
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            // Multi-octave noise around the center of the city
            const n1 = noise.noise2D(dx * 1.3, dy * 1.3);          // large lobes
            const n2 = noise.noise2D(dx * 3.1 + 50, dy * 3.1 + 50); // medium bumps
            const n3 = noise.noise2D(dx * 6.2 + 99, dy * 6.2 + 99); // small bulges
            const combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

            // Directional stretch: project angle onto the stretch axis
            const stretchDot = Math.cos(angle - stretchAngle);
            const stretchMul = 1 + stretchDot * stretchDot * stretchAmount;

            // Extra lobe in one direction
            const lobeDot = Math.max(0, Math.cos(angle - lobeAngle));
            const lobeMul = 1 + lobeDot * lobeStrength;

            // Combined deformation: ±35% from noise plus the axis stretching
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

        // Also compute avgRadius / maxRadius for use by other methods
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
            containsPoint(x: number, y: number, margin = 0) {
                const angle = Math.atan2(y - cy, x - cx);
                const d = Math.hypot(x - cx, y - cy);
                return d <= radiusAt(angle) - margin;
            },
        };
    }

    _renderWalls(ctx, cfg, outline, rng) {
        ctx.save();

        const wallPoints = outline.points;

        // Wall shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 10;
        this._drawPath(ctx, wallPoints);

        // Wall body
        ctx.strokeStyle = PALETTES.city.wall;
        ctx.lineWidth = 6;
        this._drawPath(ctx, wallPoints);

        // Wall top
        ctx.strokeStyle = PALETTES.city.wallTop;
        ctx.lineWidth = 3;
        this._drawPath(ctx, wallPoints);

        // Towers every ~8 segments along the outline
        const towerCount = 8;
        const towerStep = Math.floor(wallPoints.length / towerCount);
        for (let i = 0; i < wallPoints.length; i += towerStep) {
            drawTower(ctx, wallPoints[i].x, wallPoints[i].y, 14);
        }

        // Gates: pick 2-3 roughly opposite points on the outline.
        // We pick them at fixed fractions of the ring so the road system
        // can find them later without re-computing.
        const gateFractions = [0.0, 0.5];  // "north" and "south" equivalents on the deformed outline
        for (const f of gateFractions) {
            const idx = Math.floor(f * wallPoints.length);
            const gate = wallPoints[idx];
            ctx.fillStyle = PALETTES.city.wall;
            ctx.fillRect(gate.x - 8, gate.y - 4, 16, 8);
            ctx.fillStyle = '#3a2a1a';
            ctx.fillRect(gate.x - 4, gate.y - 3, 8, 6);
        }

        ctx.restore();
    }

    _drawPath(ctx, points) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * Organic road network:
     *
     * 1. Pick 2-4 gates as sample points along the outline polygon.
     * 2. Build "main roads": Bezier curves from each gate toward a
     *    central plaza near the city heart. The plaza is offset from
     *    the geometric center using noise, so the crossroads are never
     *    exactly in the middle.
     * 3. Add secondary branches that start on main roads and wander
     *    toward random interior points, so blocks get subdivided.
     * 4. No perfectly concentric ring roads anywhere.
     */
    _generateRoads(cfg, outline, rng, _districts) {
        const roads: Array<{ type: string; points: Array<{x:number;y:number}>; width: number }> = [];
        const cx = outline.cx;
        const cy = outline.cy;

        // City heart: offset from the geometric center by ±15% of average radius
        const heartJitter = outline.avgRadius * 0.15;
        const heart = {
            x: cx + rng.nextFloat(-heartJitter, heartJitter),
            y: cy + rng.nextFloat(-heartJitter, heartJitter),
        };

        // Pick 3-4 gates on the outline - evenly spaced indices but with jitter
        const gateCount = rng.nextInt(3, 4);
        const pts = outline.points;
        const gates: Array<{x:number;y:number}> = [];
        const gateIndices: number[] = [];
        for (let i = 0; i < gateCount; i++) {
            const baseIdx = Math.floor((i / gateCount) * pts.length);
            const jitter = rng.nextInt(-5, 5);
            const idx = ((baseIdx + jitter) % pts.length + pts.length) % pts.length;
            gateIndices.push(idx);
            gates.push({ x: pts[idx].x, y: pts[idx].y });
        }

        // Build main roads: each gate connects to the heart through a curved path.
        // We emit a polyline of ~20 points sampled along a quadratic Bezier with
        // a control point offset perpendicular to the straight line.
        for (const gate of gates) {
            const dx = heart.x - gate.x;
            const dy = heart.y - gate.y;
            const len = Math.hypot(dx, dy);
            // Perpendicular offset for the control point (curvature)
            const px = -dy / len;
            const py = dx / len;
            const curve = rng.nextFloat(-len * 0.15, len * 0.15);
            const controlX = (gate.x + heart.x) / 2 + px * curve;
            const controlY = (gate.y + heart.y) / 2 + py * curve;

            const samples = 20;
            const points: Array<{x:number;y:number}> = [];
            for (let t = 0; t <= samples; t++) {
                const u = t / samples;
                const mt = 1 - u;
                // Quadratic Bezier
                const x = mt * mt * gate.x + 2 * mt * u * controlX + u * u * heart.x;
                const y = mt * mt * gate.y + 2 * mt * u * controlY + u * u * heart.y;
                points.push({ x, y });
            }
            roads.push({ type: 'main', points, width: 5 });
        }

        // Small plaza ring around the heart (not a full city-wide ring)
        const plazaRadius = outline.avgRadius * 0.08;
        const plazaPoints: Array<{x:number;y:number}> = [];
        for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.2) {
            plazaPoints.push({
                x: heart.x + Math.cos(a) * plazaRadius,
                y: heart.y + Math.sin(a) * plazaRadius,
            });
        }
        roads.push({ type: 'plaza', points: plazaPoints, width: 4 });

        // Branching secondary streets: start on a random main road segment,
        // wander toward a random interior point inside the outline.
        const branchCount = 6 + Math.floor(gateCount * 2);
        for (let b = 0; b < branchCount; b++) {
            // Pick a random main road
            const mainRoads = roads.filter(r => r.type === 'main');
            if (mainRoads.length === 0) break;
            const source = mainRoads[rng.nextInt(0, mainRoads.length - 1)];

            // Start at a random point along its length (not at the endpoints)
            const startIdx = rng.nextInt(2, source.points.length - 3);
            const start = source.points[startIdx];

            // Pick a target inside the outline, away from the start
            let target: {x:number;y:number} | null = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                const tAngle = rng.nextFloat(0, Math.PI * 2);
                const tDist = rng.nextFloat(outline.avgRadius * 0.2, outline.avgRadius * 0.7);
                const tx = cx + Math.cos(tAngle) * tDist;
                const ty = cy + Math.sin(tAngle) * tDist;
                // Must be inside the outline and not too close to the start
                if (outline.containsPoint(tx, ty, 10) && Math.hypot(tx - start.x, ty - start.y) > 40) {
                    target = { x: tx, y: ty };
                    break;
                }
            }
            if (!target) continue;

            // Build a slightly wiggly polyline from start to target
            const segLen = 12;
            const totalDist = Math.hypot(target.x - start.x, target.y - start.y);
            const steps = Math.max(2, Math.ceil(totalDist / segLen));
            const branchPoints: Array<{x:number;y:number}> = [];
            const sdx = (target.x - start.x) / steps;
            const sdy = (target.y - start.y) / steps;
            // Perpendicular wiggle direction
            const wiggleLen = Math.hypot(sdx, sdy);
            const wpx = wiggleLen > 0 ? -sdy / wiggleLen : 0;
            const wpy = wiggleLen > 0 ?  sdx / wiggleLen : 0;

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                // Sinusoidal wiggle that starts and ends at zero
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

    _renderRoads(ctx, cfg, roads) {
        ctx.save();

        for (const road of roads) {
            // Road shadow
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

            // Road surface
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

    _renderBridges(ctx, roads, riverPoints) {
        // Find points where roads cross the river and drop a bridge there.
        // We sample the river as a polyline and check each road segment.
        const bridgeThreshold = 8;    // how close a road point must be to a river point
        const minBridgeSpacing = 40;  // don't place two bridges closer than this

        const placedBridges: Array<{ x: number; y: number }> = [];

        for (const road of roads) {
            for (let i = 0; i < road.points.length - 1; i++) {
                const a = road.points[i];
                const b = road.points[i + 1];

                // Check the midpoint of each road segment against the river
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;

                for (const rp of riverPoints) {
                    const d = Math.hypot(mx - rp.x, my - rp.y);
                    if (d >= bridgeThreshold) continue;

                    // Too close to an existing bridge?
                    let tooClose = false;
                    for (const bridge of placedBridges) {
                        if (Math.hypot(mx - bridge.x, my - bridge.y) < minBridgeSpacing) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (tooClose) break;

                    // Bridge orientation: follow the road direction so the
                    // bridge sits lengthwise across the river.
                    const angle = Math.atan2(b.y - a.y, b.x - a.x);
                    drawBridge(ctx, rp.x, rp.y, 22, angle);
                    placedBridges.push({ x: rp.x, y: rp.y });
                    break;
                }
            }
        }
    }

    _renderBuildings(ctx, cfg, districts, roads, riverPoints, centerX, centerY, cityRadius, rng, noise) {
        const { buildingDensity, style } = cfg;

        for (const district of districts) {
            const profile = DISTRICT_PROFILES[district.type];
            if (!profile) continue;

            // Track placed buildings for spacing check
            const placed: Array<{ x: number; y: number; r: number }> = [];

            // Try to place buildings up to a target count based on area + density
            const area = Math.PI * district.radius * district.radius;
            const targetCount = Math.floor((area / (profile.spacing * profile.spacing * 1.2)) * buildingDensity * profile.density);

            let attempts = 0;
            const maxAttempts = targetCount * 5;

            while (placed.length < targetCount && attempts < maxAttempts) {
                attempts++;

                // Random position within district (biased toward center)
                const angle = rng.nextFloat(0, Math.PI * 2);
                const distFromCenter = Math.sqrt(rng.next()) * district.radius;
                const bx = district.x + Math.cos(angle) * distFromCenter;
                const by = district.y + Math.sin(angle) * distFromCenter;

                // Skip if outside city
                if (distance(bx, by, centerX, centerY) > cityRadius * 0.93) continue;

                // Skip if on road
                let onRoad = false;
                for (const road of roads) {
                    for (const pt of road.points) {
                        if (distance(bx, by, pt.x, pt.y) < 7) { onRoad = true; break; }
                    }
                    if (onRoad) break;
                }
                if (onRoad) continue;

                // Skip if in river
                let inRiver = false;
                for (const pt of riverPoints) {
                    if (distance(bx, by, pt.x, pt.y) < 14) { inRiver = true; break; }
                }
                if (inRiver) continue;

                // Skip if too close to another building in this district
                let tooClose = false;
                for (const p of placed) {
                    if (distance(bx, by, p.x, p.y) < p.r) { tooClose = true; break; }
                }
                if (tooClose) continue;

                // Pick a building from the district profile
                const entry = pickBuilding(profile, rng);
                const size = rng.nextFloat(entry.sizeMin, entry.sizeMax);

                // For houses: optionally apply the player-chosen culture style
                // (elven/dwarven houses override the default human house)
                let drawFn = entry.draw;
                if (entry.draw === drawHumanHouse && style !== 'human') {
                    const effective = style === 'mixed'
                        ? rng.pick(['human', 'elven', 'dwarven'])
                        : style;
                    if (effective === 'elven')  drawFn = drawElvenHouse;
                    if (effective === 'dwarven') drawFn = drawDwarvenHouse;
                }

                drawFn(ctx, bx, by, size);
                placed.push({ x: bx, y: by, r: profile.spacing });
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

    _renderSurroundingTrees(ctx, cfg, centerX, centerY, cityRadius, rng) {
        const { width, height } = cfg;
        const margin = 30;

        for (let i = 0; i < 200; i++) {
            const x = rng.nextFloat(margin, width - margin);
            const y = rng.nextFloat(margin, height - margin);

            if (distance(x, y, centerX, centerY) < cityRadius * 1.15) continue;

            const type = rng.next() > 0.5 ? 'pine' : 'deciduous';
            drawTree(ctx, x, y, rng.nextFloat(6, 10), { type });
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
