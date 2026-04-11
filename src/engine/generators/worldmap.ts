/**
 * Calyndra Mapmaker - World/Land Map Generator
 *
 * This class is the orchestrator for world-map generation. The heavy
 * work lives in focused modules under ./worldmap/ and ../terrain.ts;
 * this file wires them together, owns the tab/control contract, and
 * handles the handful of cache refs shared between passes.
 *
 * Module layout:
 *   ./worldmap/styles.ts              base-layer terrain renderers
 *   ./worldmap/features/rivers.ts     river generation + drawing
 *   ./worldmap/features/mountains.ts  grid + ridge mountain drawing
 *   ./worldmap/features/forests.ts    forest + tree drawing
 *   ./worldmap/features/cities.ts     city placement, roads, labels, title
 *   ./worldmap/lore.ts                lore overlay drawing
 */

import { NameGenerator, SeededRandom } from '../../utils';
import { drawCompassRose, drawMapBorder, drawScaleBar } from '../assets';
import {
    renderParchmentTexture, renderAgeEffects, renderVignette,
    renderHillshading, renderHandDrawnCoastline, renderWaterWaves,
    drawBookBorder, drawBookCompass, drawTitleCartouche,
    renderCloudEdges, renderPaintedForests,
} from '../bookstyle';
import {
    generateAdvancedHeightMap, generateTemperatureMap, generateAdvancedMoistureMap,
    generateRiverSystems,
    findMountainRidges,
} from '../terrain';
import {
    renderColoredStyle,
    renderParchmentStyle,
    renderWonderdraftStyle,
    renderBookTerrainOverlay,
} from './worldmap/styles';
import { renderRiverSystems } from './worldmap/features/rivers';
import {
    renderMountainRidges,
    renderBookMountainRidges,
} from './worldmap/features/mountains';
import {
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
import {
    renderLoreRegions,
    renderLoreRiverLabels,
    renderLoreLandmarks,
} from './worldmap/lore';

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
            renderLoreRegions(ctx, cfg, loreHints.regions);
        }

        // Generate river systems with tributary merging
        const riverSystems = generateRiverSystems(
            cfg.width, cfg.height, heightMap, cfg.seaLevel, cfg.mountainLevel, rng, cfg.riverCount
        );
        const rivers = riverSystems.map(rs => rs.points);
        renderRiverSystems(ctx, cfg, riverSystems);

        // Render lore rivers (named)
        if (loreHints && loreHints.rivers.length > 0) {
            renderLoreRiverLabels(ctx, cfg, rivers, loreHints.rivers);
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
            renderLoreLandmarks(ctx, cfg, loreHints.landmarks, heightMap);
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

    // ── Legacy heightmap / moisture methods ─────────────────────────
    //
    // _generateHeightMap and _generateMoistureMap have been removed.
    // The class now uses generateAdvancedHeightMap() and
    // generateAdvancedMoistureMap() from engine/terrain.ts, which
    // run inside the generate() method directly.

    // ── Modules that own the real work ──────────────────────────────
    //
    // The class used to be ~1400 lines; since the W1-W7 refactor it's
    // essentially just getControls(), generate() and a handful of
    // cache refs. Everything else lives in its own focused module:
    //
    //   ./worldmap/styles.ts
    //     Colored, parchment, Wonderdraft and book-overlay terrain
    //     renderers. Exports renderColoredStyle, renderParchmentStyle,
    //     renderWonderdraftStyle, renderBookTerrainOverlay,
    //     drawContourLine.
    //
    //   ./worldmap/features/rivers.ts
    //     generateSimpleRivers, renderSimpleRivers, renderRiverSystems,
    //     riverColorForStyle.
    //
    //   ./worldmap/features/mountains.ts
    //     renderMountainGrid, renderBookMountainGrid,
    //     renderMountainRidges, renderBookMountainRidges.
    //
    //   ./worldmap/features/forests.ts
    //     renderForestGrid, renderBookForestGrid,
    //     renderNaturalForests, renderBookNaturalForests.
    //
    //   ./worldmap/features/cities.ts
    //     generateCities, renderCities, renderBookCities,
    //     renderRoads, renderLabels, renderTitle.
    //
    //   ./worldmap/lore.ts
    //     renderLoreRegions, renderLoreRiverLabels,
    //     renderLoreLandmarks.

}
