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
import {
    renderMountainGrid,
    renderBookMountainGrid,
    renderMountainRidges,
    renderBookMountainRidges,
} from './worldmap/features/mountains';
import {
    renderForestGrid,
    renderBookForestGrid,
    renderNaturalForests,
    renderBookNaturalForests,
} from './worldmap/features/forests';
import {
    generateCities,
    renderCities,
    renderBookCities,
    renderRoads,
    renderLabels,
    renderTitle,
} from './worldmap/features/cities';

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
            renderBookNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng);
        } else {
            renderNaturalForests(ctx, cfg, heightMap, moistureMap, temperatureMap, rng);
        }

        // Generate and render mountains along ridges (not random grid)
        const ridgePoints = findMountainRidges(cfg.width, cfg.height, heightMap, cfg.mountainLevel, rng);
        if (isBook) {
            renderBookMountainRidges(ctx, cfg, ridgePoints, rng);
        } else {
            renderMountainRidges(ctx, cfg, ridgePoints, rng);
        }

        // Render lore landmarks (named mountains, forests, etc.)
        if (loreHints && loreHints.landmarks.length > 0) {
            this._renderLoreLandmarks(ctx, cfg, loreHints.landmarks, heightMap);
        }

        // Generate cities - use lore cities if available
        const cities = generateCities(cfg, heightMap, rivers, rng, names, loreHints);

        // Render roads between cities (use lore roads if available)
        renderRoads(ctx, cfg, cities, heightMap, loreHints);

        // Render cities (book style or normal)
        if (isBook) {
            renderBookCities(ctx, cfg, cities);
        } else {
            renderCities(ctx, cfg, cities);
        }

        // Labels
        if (cfg.showLabels) {
            renderLabels(ctx, cfg, cities, rivers, names, rng);
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
            renderTitle(ctx, cfg, names, loreHints);
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

    // _renderForests moved to ./worldmap/features/forests.ts as renderForestGrid

    // _renderMountainIcons moved to ./worldmap/features/mountains.ts
    // as renderMountainGrid (kept as a fallback - the class doesn't
    // call it anymore because renderMountainRidges reads better, but
    // the function is still exported for anyone who wants the old
    // grid behaviour).


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

    // _renderBookNaturalForests moved to ./worldmap/features/forests.ts
    // as renderBookNaturalForests.
    //
    // _renderBookForests (legacy grid) moved to the same file
    // as renderBookForestGrid.

    // _renderBookMountains moved to ./worldmap/features/mountains.ts
    // as renderBookMountainGrid.

    // _renderBookCities moved to ./worldmap/features/cities.ts
    // as renderBookCities.

    // _generateCities, _renderCities, _renderRoads, _renderLabels and
    // _renderTitle all moved to ./worldmap/features/cities.ts.

    // ── Natural Rendering Methods (New Terrain Engine) ──────────────

    // _renderRiverSystems moved to ./worldmap/features/rivers.ts

    /**
     * Render forests using Poisson disk sampling for natural spacing
     * Trees cluster in moist areas and thin out in dry areas
     */
    // _renderNaturalForests moved to ./worldmap/features/forests.ts
    // as renderNaturalForests.

    // _renderMountainRidges and _renderBookMountainRidges moved to
    // ./worldmap/features/mountains.ts as renderMountainRidges and
    // renderBookMountainRidges respectively.

}
