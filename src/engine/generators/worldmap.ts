/**
 * Calyndra Mapmaker - World/Land Map Generator
 * Generates procedural fantasy world maps with terrain, rivers, cities, and labels
 */

import { SimplexNoise } from '../noise';
import { NameGenerator, PALETTES, SeededRandom, clamp, smoothstep, distance, lerpColor } from '../../utils';
import { drawMountain, drawVolcano, drawTree, drawRiver, drawCastle, drawCompassRose, drawMapBorder, drawScaleBar } from '../assets';
import {
    renderParchmentTexture, renderAgeEffects, renderVignette,
    renderHillshading, renderHandDrawnCoastline, renderWaterWaves,
    drawBookMountain, drawBookTree, drawBookCity,
    drawBookBorder, drawBookCompass, drawTitleCartouche,
    renderCloudEdges, renderPaintedForests,
} from '../bookstyle';
import {
    drawMountainSmart, drawVolcanoSmart, drawTreeSmart,
    drawCastleSmart,
} from '../assets-runtime/bridge';
import { getAssetStore } from '../assets-runtime';
import {
    generateAdvancedHeightMap, generateTemperatureMap, generateAdvancedMoistureMap,
    generateRiverSystems, classifyBiome, getBiomeColor, BIOME_COLORS,
    poissonDiskSample, findMountainRidges,
} from '../terrain';
import {
    renderColoredStyle,
    renderParchmentStyle,
    renderWonderdraftStyle,
    renderBookTerrainOverlay,
} from './worldmap/styles';
import {
    generateSimpleRivers,
    renderSimpleRivers,
    renderRiverSystems,
} from './worldmap/features/rivers';

// Lore and Zoom are optional - loaded dynamically when available
let _loreManager = null;
let _zoomController = null;

export function setWorldMapLore(lore) { _loreManager = lore; }
export function setWorldMapZoom(zoom) { _zoomController = zoom; }

export class WorldMapGenerator {
    static id = 'worldmap';
    static label = 'Weltkarte';
    static icon = '🗺️';

    constructor() {
        this.defaultConfig = {
            seed: Math.floor(Math.random() * 100000),
            width: 1200,
            height: 800,
            scale: 3.5,
            seaLevel: 0.38,
            mountainLevel: 0.68,
            snowLevel: 0.82,
            forestDensity: 0.6,
            riverCount: 5,
            cityCount: 8,
            showGrid: false,
            showLabels: true,
            showCompass: true,
            showBorder: true,
            showScaleBar: true,
            mapStyle: 'colored', // 'colored' | 'parchment' | 'book'
            continentShape: 'natural', // 'natural' | 'island' | 'pangaea'
        };
    }

    getControls() {
        return [
            { type: 'number', key: 'seed', label: 'Seed', min: 0, max: 999999 },
            { type: 'select', key: 'width', label: 'Breite', options: [
                { value: 800, label: '800px' }, { value: 1200, label: '1200px' },
                { value: 1920, label: '1920px (HD)' }, { value: 2560, label: '2560px (QHD)' },
                { value: 3840, label: '3840px (4K)' }
            ]},
            { type: 'select', key: 'height', label: 'Höhe', options: [
                { value: 600, label: '600px' }, { value: 800, label: '800px' },
                { value: 1080, label: '1080px (HD)' }, { value: 1440, label: '1440px (QHD)' },
                { value: 2160, label: '2160px (4K)' }
            ]},
            { type: 'range', key: 'scale', label: 'Maßstab', min: 1, max: 8, step: 0.5 },
            { type: 'range', key: 'seaLevel', label: 'Meeresspiegel', min: 0.1, max: 0.7, step: 0.02 },
            { type: 'range', key: 'mountainLevel', label: 'Berghöhe', min: 0.5, max: 0.9, step: 0.02 },
            { type: 'range', key: 'forestDensity', label: 'Walddichte', min: 0, max: 1, step: 0.1 },
            { type: 'range', key: 'riverCount', label: 'Flüsse', min: 0, max: 15, step: 1 },
            { type: 'range', key: 'cityCount', label: 'Städte', min: 0, max: 20, step: 1 },
            { type: 'select', key: 'mapStyle', label: 'Stil', options: [
                { value: 'colored', label: 'Farbig' },
                { value: 'parchment', label: 'Pergament' },
                { value: 'book', label: 'Buchstil (Hochwertig)' },
                { value: 'wonderdraft', label: 'Wonderdraft (für Assets)' },
            ]},
            { type: 'select', key: 'continentShape', label: 'Kontinentform', options: [
                { value: 'natural', label: 'Natürlich' },
                { value: 'island', label: 'Insel' },
                { value: 'pangaea', label: 'Pangäa' },
            ]},
            { type: 'checkbox', key: 'showLabels', label: 'Beschriftungen' },
            { type: 'checkbox', key: 'showCompass', label: 'Kompassrose' },
            { type: 'checkbox', key: 'showBorder', label: 'Kartenrand' },
            { type: 'checkbox', key: 'showScaleBar', label: 'Maßstabsleiste' },
        ];
    }

    generate(canvas, config = {}) {
        const cfg = { ...this.defaultConfig, ...config };
        canvas.width = cfg.width;
        canvas.height = cfg.height;
        const ctx = canvas.getContext('2d');

        const noise = new SimplexNoise(cfg.seed);
        const noise2 = new SimplexNoise(cfg.seed + 1000);
        const rng = new SeededRandom(cfg.seed);
        const names = new NameGenerator(cfg.seed);

        // Get lore data if available
        const loreHints = _loreManager?.hasLore() ? _loreManager.getWorldMapHints() : null;

        // ── Advanced Terrain Generation ──
        const heightMap = generateAdvancedHeightMap(cfg.width, cfg.height, {
            seed: cfg.seed,
            scale: cfg.scale,
            continentShape: cfg.continentShape,
            seaLevel: cfg.seaLevel,
        });

        // Temperature-based climate zones (latitude + altitude)
        const temperatureMap = generateTemperatureMap(
            cfg.width, cfg.height, heightMap, cfg.seaLevel, cfg.seed
        );
        this._lastTempMap = temperatureMap;

        // Moisture from coastal proximity + noise + rain shadow
        const moistureMap = generateAdvancedMoistureMap(
            cfg.width, cfg.height, heightMap, cfg.seaLevel, cfg.seed
        );

        // Is this the book-quality style?
        const isBook = cfg.mapStyle === 'book';
        // Wonderdraft style: warm parchment base tuned for asset overlays
        const isWonderdraft = cfg.mapStyle === 'wonderdraft';

        // ── Parchment base ──
        if (isBook) {
            renderParchmentTexture(ctx, cfg.width, cfg.height, cfg.seed);
        } else if (isWonderdraft) {
            // Wonderdraft assets look best on a warm cream background.
            renderWonderdraftStyle(ctx, cfg, heightMap, moistureMap);
        }

        // Render terrain
        if (isBook) {
            renderBookTerrainOverlay(ctx, cfg, heightMap, moistureMap);
        } else if (isWonderdraft) {
            // Terrain already drawn by renderWonderdraftStyle above
        } else if (cfg.mapStyle === 'parchment') {
            renderParchmentStyle(ctx, cfg, heightMap);
        } else {
            // Colored style returns the (new or cached) temperature map
            // so later passes that also need it can reuse it
            this._lastTempMap = renderColoredStyle(
                ctx, cfg, heightMap, moistureMap, this._lastTempMap ?? null,
            );
        }

        // ── Hillshading ──
        if (isBook) {
            renderHillshading(ctx, cfg.width, cfg.height, heightMap, {
                strength: 0.35,
                ambient: 0.35,
            });
        } else if (isWonderdraft) {
            // Very subtle shading - Wonderdraft assets already carry their
            // own 3D baked in via drop shadows, so we only add a whisper
            // of terrain depth underneath
            renderHillshading(ctx, cfg.width, cfg.height, heightMap, {
                strength: 0.15,
                ambient: 0.55,
            });
        } else if (cfg.mapStyle === 'colored') {
            // Subtle hillshading for colored mode too
            renderHillshading(ctx, cfg.width, cfg.height, heightMap, {
                strength: 0.2,
                ambient: 0.4,
            });
        }

        // ── Book style: water wave pattern ──
        if (isBook) {
            renderWaterWaves(ctx, cfg.width, cfg.height, heightMap, cfg.seaLevel, {
                waveSpacing: 6,
                waveColor: 'rgba(40, 60, 100, 0.25)',
            });
        }

        // Render lore region overlays (subtle borders/labels)
        if (loreHints && loreHints.regions.length > 0) {
            this._renderLoreRegions(ctx, cfg, loreHints.regions);
        }

        // Generate river systems with tributary merging
        const riverSystems = generateRiverSystems(
            cfg.width, cfg.height, heightMap, cfg.seaLevel, cfg.mountainLevel, rng, cfg.riverCount
        );
        const rivers = riverSystems.map(rs => rs.points);
        renderRiverSystems(ctx, cfg, riverSystems);

        // Render lore rivers (named)
        if (loreHints && loreHints.rivers.length > 0) {
            this._renderLoreRiverLabels(ctx, cfg, rivers, loreHints.rivers);
        }

        // ── Book style: hand-drawn coastline ──
        if (isBook) {
            renderHandDrawnCoastline(ctx, cfg.width, cfg.height, heightMap, cfg.seaLevel, {
                hachureLines: true,
                hachureLength: 8,
                hachureDensity: 0.12,
            });
        }

        // Render forests as painted masses (like reference RPG maps).
        // In Wonderdraft mode we skip this because the palette is too
        // light and the dark green masses would clash with the asset
        // stamps we're about to draw on top.
        if (!isWonderdraft) {
            renderPaintedForests(ctx, cfg.width, cfg.height, heightMap, moistureMap,
                temperatureMap, cfg.seaLevel, cfg.mountainLevel, cfg.forestDensity, cfg.seed);
        }

        // Individual trees at forest edges for detail. Wonderdraft mode
        // relies entirely on imported tree assets (via _renderNaturalForests
        // which goes through drawTreeSmart), so we still call it but the
        // procedural fallback icons would show through on missing assets.
        if (isBook) {
            this._renderBookNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng);
        } else {
            this._renderNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng);
        }

        // Generate and render mountains along ridges (not random grid)
        const ridgePoints = findMountainRidges(cfg.width, cfg.height, heightMap, cfg.mountainLevel, rng);
        if (isBook) {
            this._renderBookMountainRidges(ctx, cfg, ridgePoints, rng);
        } else {
            this._renderMountainRidges(ctx, cfg, ridgePoints, rng);
        }

        // Render lore landmarks (named mountains, forests, etc.)
        if (loreHints && loreHints.landmarks.length > 0) {
            this._renderLoreLandmarks(ctx, cfg, loreHints.landmarks, heightMap);
        }

        // Generate cities - use lore cities if available
        const cities = this._generateCities(cfg, heightMap, rivers, rng, names, loreHints);

        // Render roads between cities (use lore roads if available)
        this._renderRoads(ctx, cfg, cities, heightMap, loreHints);

        // Render cities (book style or normal)
        if (isBook) {
            this._renderBookCities(ctx, cfg, cities);
        } else {
            this._renderCities(ctx, cfg, cities);
        }

        // Labels
        if (cfg.showLabels) {
            this._renderLabels(ctx, cfg, cities, rivers, names, rng);
        }

        // Decorations (book style uses dedicated ornate versions)
        if (isBook) {
            if (cfg.showBorder) drawBookBorder(ctx, cfg.width, cfg.height);
            if (cfg.showCompass) drawBookCompass(ctx, cfg.width - 80, cfg.height - 80, 60);
            if (cfg.showScaleBar) drawScaleBar(ctx, cfg.width * 0.05, cfg.height - 50, cfg.width);
        } else {
            if (cfg.showBorder) drawMapBorder(ctx, cfg.width, cfg.height, 'ornate');
            if (cfg.showCompass) drawCompassRose(ctx, cfg.width - 80, cfg.height - 80, 60);
            if (cfg.showScaleBar) drawScaleBar(ctx, cfg.width * 0.05, cfg.height - 40, cfg.width);
        }

        // Title
        if (isBook) {
            const title = loreHints?.worldName || 'Calyndra';
            const subtitle = loreHints?.worldDescription
                ? loreHints.worldDescription.slice(0, 60) + (loreHints.worldDescription.length > 60 ? '...' : '')
                : 'Eine Fantasywelt';
            drawTitleCartouche(ctx, cfg.width / 2, cfg.height * 0.04 + 20, title, subtitle, {
                fontSize: Math.max(20, cfg.width * 0.022),
            });
        } else {
            this._renderTitle(ctx, cfg, names, loreHints);
        }

        // ── Cloud/fog wisps at edges (all styles) ──
        renderCloudEdges(ctx, cfg.width, cfg.height, cfg.seed, {
            opacity: isBook ? 0.6 : 0.35,
            coverage: isBook ? 0.12 : 0.08,
        });

        // ── Final post-processing ──
        if (isBook) {
            renderAgeEffects(ctx, cfg.width, cfg.height, cfg.seed, 0.5);
            renderVignette(ctx, cfg.width, cfg.height, 0.35);
        } else if (isWonderdraft) {
            // Very subtle age spots and a soft vignette, warm tone so
            // the Wonderdraft assets still pop
            renderAgeEffects(ctx, cfg.width, cfg.height, cfg.seed, 0.2);
            renderVignette(ctx, cfg.width, cfg.height, 0.1);
        } else {
            // Subtle vignette for all other styles
            renderVignette(ctx, cfg.width, cfg.height, 0.15);
        }

        // Register clickable areas for zoom if zoom controller exists
        if (_zoomController) {
            _zoomController.clearClickableAreas();

            // Cities are clickable → zoom to city map
            for (const city of cities) {
                const clickRadius = city.isCapital || city.size === 'large' ? 20 : 12;
                _zoomController.registerClickableArea({
                    shape: 'circle',
                    x: city.x,
                    y: city.y,
                    radius: clickRadius,
                    label: `${city.name} (Stadt anzeigen)`,
                    targetLevel: 'city',
                    targetData: {
                        name: city.name,
                        id: city.loreId || null,
                        size: city.size,
                        style: city.style || 'human',
                        isCapital: city.isCapital,
                        seed: cfg.seed + city.name.charCodeAt(0) * 100,
                    },
                });
            }

            // Lore regions are clickable → zoom to region view
            if (loreHints) {
                for (const region of loreHints.regions) {
                    const rx = region.relX * cfg.width;
                    const ry = region.relY * cfg.height;
                    const rRadius = region.relRadius * Math.min(cfg.width, cfg.height);
                    _zoomController.registerClickableArea({
                        shape: 'circle',
                        x: rx,
                        y: ry,
                        radius: rRadius,
                        label: `${region.name} (Region anzeigen)`,
                        targetLevel: 'region',
                        targetData: {
                            id: region.id,
                            name: region.name,
                            seed: cfg.seed,
                        },
                        showIndicator: false, // regions are subtle
                    });
                }
            }

            // Render breadcrumbs if zoomed
            _zoomController.renderBreadcrumbs(ctx, cfg.width);
        }

        // Store generated data for external access
        this._lastGeneratedData = { cities, rivers, heightMap, moistureMap, cfg };
    }

    getLastGeneratedData() {
        return this._lastGeneratedData;
    }

    _generateHeightMap(cfg, noise, noise2) {
        const { width, height, scale, continentShape } = cfg;
        const map = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = x / width * scale;
                const ny = y / height * scale;

                // Layered noise
                let h = noise.fbm(nx, ny, 6, 2.0, 0.5) * 0.6;
                h += noise.ridgeNoise(nx * 1.5, ny * 1.5, 4) * 0.3;
                h += noise2.warpedNoise(nx, ny, 0.8, 0.4) * 0.1;

                // Normalize to 0-1
                h = (h + 1) * 0.5;

                // Apply continent shape
                if (continentShape === 'island') {
                    const dx = (x / width - 0.5) * 2;
                    const dy = (y / height - 0.5) * 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    h -= smoothstep(0.3, 0.9, dist) * 0.6;
                } else if (continentShape === 'pangaea') {
                    const dx = (x / width - 0.5) * 2;
                    const dy = (y / height - 0.5) * 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    h -= smoothstep(0.5, 1.0, dist) * 0.4;
                    h += 0.1;
                } else {
                    // Natural - soften edges
                    const edgeFade = 0.05;
                    const ex = smoothstep(0, edgeFade, x / width) * smoothstep(0, edgeFade, 1 - x / width);
                    const ey = smoothstep(0, edgeFade, y / height) * smoothstep(0, edgeFade, 1 - y / height);
                    h *= ex * ey * 0.3 + 0.7;
                }

                map[y * width + x] = clamp(h, 0, 1);
            }
        }

        return map;
    }

    _generateMoistureMap(cfg, noise) {
        const { width, height, scale } = cfg;
        const map = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = x / width * scale * 1.5 + 100;
                const ny = y / height * scale * 1.5 + 100;
                map[y * width + x] = (noise.fbm(nx, ny, 4) + 1) * 0.5;
            }
        }

        return map;
    }

    // Style renderers moved to ./worldmap/styles.ts
    // Kept as a comment for greppability: _renderColoredStyle,
    // _renderParchmentStyle, _renderWonderdraftBase,
    // _renderBookTerrainOverlay, _drawContourLine

    // River generation / rendering moved to ./worldmap/features/rivers.ts
    // generateSimpleRivers, renderSimpleRivers, renderRiverSystems

    _renderForests(ctx, cfg, heightMap, moistureMap, noise, rng) {
        const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;
        // When PNG assets are loaded, tree stamps are ~3x larger than the
        // procedural icons, so we need a much wider spacing to avoid overlap.
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

                // Seed the variant picker from grid position so re-renders
                // with the same map pick the same tree variant
                const variantSeed = (x * 73856093) ^ (y * 19349663);
                drawTreeSmart(ctx, x + offsetX, y + offsetY, size, { type }, variantSeed);
            }
        }
    }

    _renderMountainIcons(ctx, cfg, heightMap, rng) {
        const { width, height, mountainLevel } = cfg;
        // With PNG assets loaded, mountain stamps are much larger - space them out
        const store = getAssetStore();
        const hasMountainAssets = store.hasCategory('mountain');
        const spacing = hasMountainAssets ? 56 : 20;

        for (let y = spacing; y < height - spacing; y += spacing) {
            for (let x = spacing; x < width - spacing; x += spacing) {
                const h = heightMap[y * width + x];
                if (h < mountainLevel) continue;

                const offsetX = rng.nextFloat(-5, 5);
                const offsetY = rng.nextFloat(-5, 5);
                const size = 12 + (h - mountainLevel) * 40;
                const variantSeed = (x * 83492791) ^ (y * 12996221);

                // Small chance of volcano
                if (h > mountainLevel + 0.15 && rng.next() > 0.92) {
                    drawVolcanoSmart(ctx, x + offsetX, y + offsetY, size * 1.3, {}, variantSeed);
                } else {
                    drawMountainSmart(ctx, x + offsetX, y + offsetY, size, { snow: h > 0.78 }, variantSeed);
                }
            }
        }
    }

    _generateCities(cfg, heightMap, rivers, rng, names, loreHints) {
        const { width, height, seaLevel, mountainLevel, cityCount } = cfg;
        const cities = [];

        // First: place lore cities at their specified positions
        if (loreHints && loreHints.cities.length > 0) {
            for (const loreCity of loreHints.cities) {
                let cx, cy;

                if (loreCity.relX !== null && loreCity.relY !== null) {
                    // Use specified relative position
                    cx = Math.floor(loreCity.relX * width);
                    cy = Math.floor(loreCity.relY * height);
                } else if (loreCity.regionId) {
                    // Place near region center
                    const region = loreHints.regions.find(r => r.id === loreCity.regionId);
                    if (region) {
                        cx = Math.floor(region.relX * width + rng.nextFloat(-40, 40));
                        cy = Math.floor(region.relY * height + rng.nextFloat(-40, 40));
                    } else {
                        cx = rng.nextInt(width * 0.1, width * 0.9);
                        cy = rng.nextInt(height * 0.1, height * 0.9);
                    }
                } else {
                    // Find a good land position
                    cx = rng.nextInt(width * 0.1, width * 0.9);
                    cy = rng.nextInt(height * 0.1, height * 0.9);
                    for (let attempt = 0; attempt < 50; attempt++) {
                        const h = heightMap[cy * width + cx];
                        if (h > seaLevel + 0.02 && h < mountainLevel * 0.85) break;
                        cx = rng.nextInt(width * 0.1, width * 0.9);
                        cy = rng.nextInt(height * 0.1, height * 0.9);
                    }
                }

                // Clamp to canvas
                cx = clamp(cx, 10, width - 10);
                cy = clamp(cy, 10, height - 10);

                // Snap to land if possible
                const h = heightMap[clamp(cy, 0, height - 1) * width + clamp(cx, 0, width - 1)];
                if (h < seaLevel) {
                    // Search nearby for land
                    for (let r = 5; r < 60; r += 5) {
                        for (let a = 0; a < Math.PI * 2; a += 0.5) {
                            const nx = clamp(Math.floor(cx + Math.cos(a) * r), 0, width - 1);
                            const ny = clamp(Math.floor(cy + Math.sin(a) * r), 0, height - 1);
                            if (heightMap[ny * width + nx] > seaLevel + 0.02) {
                                cx = nx;
                                cy = ny;
                                r = 999; // break outer
                                break;
                            }
                        }
                    }
                }

                const sizeMap = { village: 'small', town: 'small', city: 'medium', metropolis: 'large', capital: 'large' };
                cities.push({
                    x: cx,
                    y: cy,
                    name: loreCity.name,
                    size: sizeMap[loreCity.size] || 'medium',
                    style: loreCity.style || 'human',
                    isCapital: loreCity.isCapital || false,
                    loreId: loreCity.id,
                    description: loreCity.description,
                    fromLore: true,
                });
            }
        }

        // Then: fill remaining slots with procedural cities
        const remainingCount = Math.max(0, cityCount - cities.length);
        for (let i = 0; i < remainingCount; i++) {
            let bestX = 0, bestY = 0, bestScore = -Infinity;

            for (let attempt = 0; attempt < 100; attempt++) {
                const x = rng.nextInt(width * 0.08, width * 0.92);
                const y = rng.nextInt(height * 0.08, height * 0.92);
                const h = heightMap[y * width + x];

                if (h < seaLevel + 0.02 || h > mountainLevel * 0.85) continue;

                let score = 0;

                // Coastal bonus
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

                // Distance from ALL cities (including lore cities)
                let minCityDist = Infinity;
                for (const city of cities) {
                    const d = distance(x, y, city.x, city.y);
                    minCityDist = Math.min(minCityDist, d);
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

    _renderCities(ctx, cfg, cities) {
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

    _renderRoads(ctx, cfg, cities, heightMap, loreHints) {
        if (cities.length < 2) return;

        const isBook = cfg.mapStyle === 'book';
        ctx.strokeStyle = isBook ? 'rgba(35, 25, 15, 0.45)' :
            cfg.mapStyle === 'parchment' ? PALETTES.parchment.road : '#8a7a5a';
        ctx.lineWidth = isBook ? 1 : 1.5;
        ctx.setLineDash(isBook ? [3, 5] : [4, 4]);

        // Draw lore-defined roads first (thicker, with names)
        if (loreHints && loreHints.roads.length > 0) {
            ctx.save();
            ctx.lineWidth = isBook ? 1.5 : 2.5;
            ctx.setLineDash(isBook ? [4, 4] : [6, 3]);
            ctx.strokeStyle = isBook ? 'rgba(35, 25, 15, 0.5)' :
                cfg.mapStyle === 'parchment' ? '#6a5a4a' : '#7a6a4a';

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

                // Road name label
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

            ctx.strokeStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.road : '#8a7a5a';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
        }

        // Connect nearby cities
        for (let i = 0; i < cities.length; i++) {
            let closest = null;
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
                // Slight curve
                const midX = (cities[i].x + closest.x) / 2 + (Math.random() - 0.5) * 20;
                const midY = (cities[i].y + closest.y) / 2 + (Math.random() - 0.5) * 20;
                ctx.quadraticCurveTo(midX, midY, closest.x, closest.y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    }

    _renderLabels(ctx, cfg, cities, rivers, names, rng) {
        const isBook = cfg.mapStyle === 'book';
        const isParchment = cfg.mapStyle === 'parchment' || isBook;
        const textColor = isParchment ? 'rgba(35, 25, 15, 0.9)' : '#1a1a1a';
        const shadowColor = isBook ? 'transparent' : (isParchment ? 'transparent' : 'rgba(255,255,255,0.7)');

        // City labels
        for (const city of cities) {
            const fontSize = city.isCapital ? 14 : (city.size === 'medium' ? 11 : 9);
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

        // River labels
        for (const river of rivers) {
            if (river.length < 10) continue;
            const midIdx = Math.floor(river.length * 0.4);
            const pt = river[midIdx];
            const riverName = names.generate('river');

            ctx.save();
            ctx.font = 'italic 9px "Palatino Linotype", serif';
            ctx.fillStyle = isParchment ? PALETTES.parchment.water : '#2a5a8a';
            ctx.textAlign = 'center';

            // Calculate angle
            const nextPt = river[Math.min(midIdx + 3, river.length - 1)];
            const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
            ctx.translate(pt.x, pt.y);
            ctx.rotate(angle);
            ctx.fillText(riverName, 0, -5);
            ctx.restore();
        }
    }

    _renderTitle(ctx, cfg, names, loreHints) {
        const title = loreHints?.worldName || 'Calyndra';
        const subtitle = loreHints?.worldDescription
            ? `~ ${loreHints.worldDescription.slice(0, 60)}${loreHints.worldDescription.length > 60 ? '...' : ''} ~`
            : '~ Eine Fantasywelt ~';
        const fontSize = Math.max(20, cfg.width * 0.025);

        ctx.font = `bold ${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const x = cfg.width / 2;
        const y = cfg.height * 0.02 + 15;

        // Shadow
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 4;
        ctx.strokeText(title, x, y);

        // Text
        ctx.fillStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.ink : '#1a1a0a';
        ctx.fillText(title, x, y);

        // Subtitle
        ctx.font = `italic ${fontSize * 0.5}px "Palatino Linotype", serif`;
        ctx.fillText(subtitle, x, y + fontSize + 4);
    }

    // ── Lore Rendering Methods ──────────────────────────────────────

    _renderLoreRegions(ctx, cfg, regions) {
        ctx.save();
        for (const region of regions) {
            const rx = region.relX * cfg.width;
            const ry = region.relY * cfg.height;
            const rRadius = region.relRadius * Math.min(cfg.width, cfg.height);

            // Subtle region boundary
            ctx.strokeStyle = 'rgba(42, 26, 10, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Region name
            ctx.setLineDash([]);
            ctx.font = 'italic 13px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 3;
            ctx.strokeText(region.name, rx, ry - rRadius + 15);
            ctx.fillStyle = 'rgba(42, 26, 10, 0.7)';
            ctx.fillText(region.name, rx, ry - rRadius + 15);
        }
        ctx.restore();
    }

    _renderLoreRiverLabels(ctx, cfg, generatedRivers, loreRivers) {
        // Label generated rivers with lore names if available
        const isParchment = cfg.mapStyle === 'parchment';
        const usedRivers = new Set();

        for (let i = 0; i < Math.min(generatedRivers.length, loreRivers.length); i++) {
            const river = generatedRivers[i];
            const loreRiver = loreRivers[i];
            if (river.length < 10 || !loreRiver.name) continue;

            const midIdx = Math.floor(river.length * 0.4);
            const pt = river[midIdx];

            ctx.save();
            ctx.font = 'italic 10px "Palatino Linotype", serif';
            ctx.fillStyle = isParchment ? PALETTES.parchment.water : '#2a5a8a';
            ctx.textAlign = 'center';

            const nextPt = river[Math.min(midIdx + 3, river.length - 1)];
            const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
            ctx.translate(pt.x, pt.y);
            ctx.rotate(angle);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.strokeText(loreRiver.name, 0, -6);
            ctx.fillText(loreRiver.name, 0, -6);
            ctx.restore();

            usedRivers.add(i);
        }
    }

    _renderLoreLandmarks(ctx, cfg, landmarks, heightMap) {
        ctx.save();
        for (const lm of landmarks) {
            if (lm.relX === null || lm.relY === null) continue;

            const lx = lm.relX * cfg.width;
            const ly = lm.relY * cfg.height;

            // Render label for the landmark
            ctx.font = 'bold 10px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 3;

            let label = lm.name;
            let yOffset = 0;

            // Add type-specific prefix/icon hint
            switch (lm.type) {
                case 'mountain': label = '⛰ ' + lm.name; yOffset = -8; break;
                case 'volcano': label = '🌋 ' + lm.name; yOffset = -8; break;
                case 'forest': label = '🌲 ' + lm.name; yOffset = 4; break;
                case 'lake': label = '💧 ' + lm.name; yOffset = 4; break;
                case 'ruins': label = '🏚 ' + lm.name; yOffset = 4; break;
                case 'cave': label = '⬛ ' + lm.name; yOffset = 4; break;
            }

            ctx.strokeText(label, lx, ly + yOffset);
            ctx.fillStyle = '#2a1a0a';
            ctx.fillText(label, lx, ly + yOffset);
        }
        ctx.restore();
    }

    // ── Book-Style Rendering Methods ─────────────────────────────────

    // _renderBookTerrainOverlay moved to ./worldmap/styles.ts

    _renderBookNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng) {
        const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;

        // Poisson disk for natural spacing (book style = slightly denser)
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

            const type = t < 0.25 ? 'pine' : (rng.next() > 0.35 ? 'deciduous' : 'pine');
            const size = rng.nextFloat(4, 7);
            drawBookTree(ctx, pt.x, pt.y, size, { type });
        }
    }

    // Legacy method kept for compatibility
    _renderBookForests(ctx, cfg, heightMap, moistureMap, noise, rng) {
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

    _renderBookMountains(ctx, cfg, heightMap, rng) {
        const { width, height, mountainLevel } = cfg;
        const spacing = 18;

        for (let y = spacing; y < height - spacing; y += spacing) {
            for (let x = spacing; x < width - spacing; x += spacing) {
                const h = heightMap[y * width + x];
                if (h < mountainLevel) continue;

                const offsetX = rng.nextFloat(-4, 4);
                const offsetY = rng.nextFloat(-4, 4);
                const size = 14 + (h - mountainLevel) * 50;

                drawBookMountain(ctx, x + offsetX, y + offsetY, size, {
                    snow: h > 0.78,
                });
            }
        }
    }

    _renderBookCities(ctx, cfg, cities) {
        for (const city of cities) {
            const size = city.isCapital || city.size === 'large' ? 16 : (city.size === 'medium' ? 11 : 8);
            drawBookCity(ctx, city.x, city.y, size, {
                isCapital: city.isCapital || city.size === 'large',
            });
        }
    }

    // ── Natural Rendering Methods (New Terrain Engine) ──────────────

    // _renderRiverSystems moved to ./worldmap/features/rivers.ts

    /**
     * Render forests using Poisson disk sampling for natural spacing
     * Trees cluster in moist areas and thin out in dry areas
     */
    _renderNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng) {
        const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;

        // Poisson disk for natural spacing
        const minDist = Math.max(8, 16 - forestDensity * 8);
        const treePoints = poissonDiskSample(width, height, minDist, rng);

        for (const pt of treePoints) {
            const ix = clamp(Math.floor(pt.x), 0, width - 1);
            const iy = clamp(Math.floor(pt.y), 0, height - 1);
            const idx = iy * width + ix;

            const h = heightMap[idx];
            const m = moistureMap[idx];
            const t = temperatureMap[idx];

            // Only draw on land, not mountains
            if (h <= seaLevel || h >= mountainLevel * 0.88) continue;

            // Moisture threshold with smooth falloff
            if (m < 0.35) continue;
            const forestChance = (m - 0.35) * 2.5 * forestDensity;
            if (rng.next() > forestChance) continue;

            // Tree type based on temperature
            let type;
            if (t < 0.25) {
                type = 'pine'; // Cold = conifers
            } else if (t > 0.7) {
                type = 'deciduous'; // Tropical = broad leaves
                if (rng.next() > 0.5) continue; // Sparser in savanna
            } else {
                type = rng.next() > 0.35 ? 'deciduous' : 'pine'; // Mixed
            }

            const size = rng.nextFloat(5, 9);
            const variantSeed = (Math.floor(pt.x) * 73856093) ^ (Math.floor(pt.y) * 19349663);
            drawTreeSmart(ctx, pt.x, pt.y, size, { type }, variantSeed);
        }
    }

    /**
     * Render mountains along detected ridges (connected ranges)
     */
    _renderMountainRidges(ctx, cfg, ridgePoints, rng) {
        for (const pt of ridgePoints) {
            const variantSeed = (Math.floor(pt.x) * 83492791) ^ (Math.floor(pt.y) * 12996221);
            // Small chance of volcano on highest peaks
            if (pt.isPeak && pt.height > cfg.mountainLevel + 0.18 && rng.next() > 0.9) {
                drawVolcanoSmart(ctx, pt.x, pt.y, pt.size * 1.2, {}, variantSeed);
            } else {
                drawMountainSmart(ctx, pt.x, pt.y, pt.size, { snow: pt.height > 0.78 }, variantSeed);
            }
        }
    }

    /**
     * Render book-style mountains along ridges
     */
    _renderBookMountainRidges(ctx, cfg, ridgePoints, rng) {
        for (const pt of ridgePoints) {
            drawBookMountain(ctx, pt.x, pt.y, pt.size, { snow: pt.height > 0.78 });
        }
    }

}
