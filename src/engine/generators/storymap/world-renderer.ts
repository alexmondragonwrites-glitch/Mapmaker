/**
 * World overview renderer for the Story Map.
 *
 * Uses the SAME procedural terrain pipeline as the worldmap generator
 * (heightmap, book-style terrain, hillshading, forests, mountains,
 * rivers, coastlines) to produce a rich visual base. Then overlays
 * the story-specific elements: fog of war, authored routes, location
 * nodes with type-specific icons, character markers, supernatural
 * indicators, and chapter-gated visibility.
 */

import { SimplexNoise } from '../../noise';
import { SeededRandom } from '../../../utils';
import {
    generateAdvancedHeightMap,
    generateTemperatureMap,
    generateAdvancedMoistureMap,
    generateRiverSystems,
    findMountainRidges,
} from '../../terrain';
import {
    renderParchmentTexture,
    renderHillshading,
    renderWaterWaves,
    renderHandDrawnCoastline,
    renderPaintedForests,
    renderVignette,
    drawBookCompass,
    drawBookBorder,
} from '../../bookstyle';
import { renderBookTerrainOverlay } from '../worldmap/styles';
import { renderBookNaturalForests } from '../worldmap/features/forests';
import { renderBookMountainRidges } from '../worldmap/features/mountains';
import { renderRiverSystems } from '../worldmap/features/rivers';
import { drawTree, drawHumanHouse, drawTower, drawTemple, drawWell } from '../../assets';
import { parseSVGPath, scalePoints, scaleCoord, drawPointPath } from './svg-path';
import {
    getVisibleLocations,
    isLocationDestroyed,
    getCharactersAtLocation,
    getSupernaturalAtLocation,
} from './data-loader';
import { buildExploredMask } from './explored-area';
import type { StoryWorldData, StoryLocation, Point } from './types';

// The JSON viewBox dimensions
const VIEW_W = 1000;
const VIEW_H = 650;
// Fixed seed for reproducible story world terrain
const WORLD_SEED = 42;

/**
 * Render the world overview map on the canvas.
 */
export function renderWorldOverview(
    ctx: CanvasRenderingContext2D,
    cfg: Record<string, unknown>,
    data: StoryWorldData,
    chapter: number,
    zoomController: any,
) {
    const width = cfg.width as number;
    const height = cfg.height as number;
    const showPaths = cfg.showPaths as boolean;
    const showCharacters = cfg.showCharacters as boolean;
    const showSupernatural = cfg.showSupernatural as boolean;
    const showLabels = cfg.showLabels as boolean;
    const useExploredArea = cfg.useExploredArea !== false;
    const radiusMultiplier = (cfg.exploredRadius as number) ?? 1;

    // ── 1. Terra Incognita background (everything outside explored area) ──
    renderTerraIncognita(ctx, width, height);

    // ── 2. Render terrain to an offscreen canvas, then mask it ──
    const visibleLocations = getVisibleLocations(data, chapter);

    if (useExploredArea && visibleLocations.length > 0) {
        // Render full terrain to an offscreen canvas
        const terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = width;
        terrainCanvas.height = height;
        const terrainCtx = terrainCanvas.getContext('2d')!;

        renderProceduralTerrain(terrainCtx, width, height);
        renderRegionOverlays(terrainCtx, data, width, height);

        // Build the explored mask and apply it as alpha
        const mask = buildExploredMask(data, chapter, width, height, radiusMultiplier);
        terrainCtx.globalCompositeOperation = 'destination-in';
        terrainCtx.drawImage(mask, 0, 0);
        terrainCtx.globalCompositeOperation = 'source-over';

        // Composite the masked terrain onto the main canvas
        ctx.drawImage(terrainCanvas, 0, 0);

        // Decorative inky edge around the explored boundary
        renderExploredEdge(ctx, mask, width, height);
    } else {
        // Fallback: full terrain without masking
        renderProceduralTerrain(ctx, width, height);
        renderRegionOverlays(ctx, data, width, height);
    }

    // ── 3. Paths/routes (only between visible locations) ──
    if (showPaths) {
        renderWorldPaths(ctx, data, chapter, width, height);
    }

    // ── 4. Location nodes with type-specific icons ──
    renderLocationNodes(ctx, data, visibleLocations, chapter, width, height, showLabels);

    // ── 5. Character markers ──
    if (showCharacters) {
        renderCharacterMarkers(ctx, data, visibleLocations, chapter, width, height);
    }

    // ── 6. Supernatural indicators ──
    if (showSupernatural) {
        renderSupernaturalIndicators(ctx, data, visibleLocations, chapter, width, height);
    }

    // ── 7. Terra Incognita decorations (faded ink in unexplored regions) ──
    if (useExploredArea && visibleLocations.length > 0) {
        renderTerraIncognitaLabel(ctx, data, chapter, width, height);
    }

    // ── 8. Border + compass + title ──
    drawBookBorder(ctx, width, height, { color: '#3a2a18' });
    drawBookCompass(ctx, width - 50, height - 55, 35, {});
    renderTitle(ctx, data, chapter, width);

    // ── 9. Vignette for atmosphere ──
    renderVignette(ctx, width, height, 0.3);

    // ── 10. Register clickable areas for zoom-in ──
    if (zoomController) {
        registerClickableAreas(zoomController, visibleLocations, width, height);
    }
}

// ── Terra Incognita Background ──────────────────────────────────

function renderTerraIncognita(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    // Dark parchment-like base for the unknown areas
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.7,
    );
    gradient.addColorStop(0, '#1a1208');
    gradient.addColorStop(0.6, '#0f0a04');
    gradient.addColorStop(1, '#050302');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle noise grain
    const noise = new SimplexNoise(999);
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const n = noise.noise2D(x / 60, y / 60);
            if (n > 0.3) {
                ctx.fillStyle = `rgba(60, 40, 20, ${(n - 0.3) * 0.15})`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }
}

// ── Explored Edge Decoration ────────────────────────────────────

function renderExploredEdge(
    ctx: CanvasRenderingContext2D,
    mask: HTMLCanvasElement,
    width: number,
    height: number,
) {
    // Dark glow around the explored area — makes the edge feel like
    // the map fades into shadow rather than a hard cut-out
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const edgeCtx = edgeCanvas.getContext('2d')!;

    // Draw the mask bigger with a dark stroke → creates a halo
    edgeCtx.drawImage(mask, 0, 0);
    const img = edgeCtx.getImageData(0, 0, width, height);
    const d = img.data;

    // Create an edge mask: pixels where the mask is partially transparent
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i];
        // Band between 20-160 = edge transition
        if (v > 20 && v < 160) {
            const t = (v - 20) / 140;
            d[i] = 40;
            d[i + 1] = 25;
            d[i + 2] = 12;
            d[i + 3] = Math.round(120 * (1 - t));
        } else {
            d[i + 3] = 0;
        }
    }
    edgeCtx.putImageData(img, 0, 0);

    ctx.drawImage(edgeCanvas, 0, 0);
}

// ── Terra Incognita Label ───────────────────────────────────────

function renderTerraIncognitaLabel(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    chapter: number,
    width: number,
    height: number,
) {
    // Faded ink text in the dark corners suggesting the unknown
    const labels = [
        { x: width * 0.12, y: height * 0.12, text: '· Terra Incognita ·' },
        { x: width * 0.88, y: height * 0.88, text: '· Unerforschtes Land ·' },
    ];

    ctx.save();
    ctx.font = 'italic 14px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(140, 100, 70, 0.35)';

    for (const lbl of labels) {
        ctx.fillText(lbl.text, lbl.x, lbl.y);
    }
    ctx.restore();
}

// ── Procedural Terrain ──────────────────────────────────────────

function renderProceduralTerrain(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    const rng = new SeededRandom(WORLD_SEED);

    // Regional-scale terrain config: the story plays in the western
    // borderlands of Calyndra — a few villages, forest edges, and
    // rolling hills. NOT a continent with oceans and mountain ranges.
    //
    // Key differences from the worldmap defaults:
    //   - seaLevel very low: almost no water bodies (just the River
    //     Seren and a few ponds — those come from story data, not
    //     the height map)
    //   - continentShape 'pangaea': produces contiguous land instead
    //     of islands/continents with oceans between them
    //   - scale 8: smaller terrain features (hills, not mountain
    //     ranges) — feels like a regional survey, not a world atlas
    //   - mountainLevel high: very few peaks — this area is hilly
    //     woodland, the Ice Ridges are far to the north
    //   - forestDensity high: the western borderlands are dense
    //     forest (Thalanor to the west, Waldmeer to the south)
    //   - riverCount low: just a couple of streams
    const terrainCfg = {
        seed: WORLD_SEED,
        width,
        height,
        scale: 8,
        continentShape: 'pangaea',
        seaLevel: 0.12,
        mountainLevel: 0.88,
        mapStyle: 'book',
        forestDensity: 0.85,
        riverCount: 2,
    };

    // Generate terrain data
    const heightMap = generateAdvancedHeightMap(width, height, {
        seed: WORLD_SEED,
        scale: terrainCfg.scale,
        continentShape: terrainCfg.continentShape,
        seaLevel: terrainCfg.seaLevel,
    });

    const temperatureMap = generateTemperatureMap(
        width, height, heightMap, terrainCfg.seaLevel, WORLD_SEED,
    );

    const moistureMap = generateAdvancedMoistureMap(
        width, height, heightMap, terrainCfg.seaLevel, WORLD_SEED,
    );

    // Parchment base texture
    renderParchmentTexture(ctx, width, height, WORLD_SEED);

    // Book-style terrain overlay (land colors, sea, biomes)
    renderBookTerrainOverlay(ctx, terrainCfg, heightMap, moistureMap);

    // Hillshading for depth
    renderHillshading(ctx, width, height, heightMap, {
        strength: 0.35,
        ambient: 0.35,
    });

    // Water wave pattern
    renderWaterWaves(ctx, width, height, heightMap, terrainCfg.seaLevel, {
        waveSpacing: 6,
        waveColor: 'rgba(40, 60, 100, 0.25)',
    });

    // River systems
    const riverSystems = generateRiverSystems(
        width, height, heightMap, terrainCfg.seaLevel,
        terrainCfg.mountainLevel, rng, terrainCfg.riverCount,
    );
    renderRiverSystems(ctx, terrainCfg, riverSystems);

    // Hand-drawn coastline
    renderHandDrawnCoastline(ctx, width, height, heightMap, terrainCfg.seaLevel, {
        hachureLines: true,
        hachureLength: 8,
        hachureDensity: 0.12,
    });

    // Painted forests (mass fills)
    renderPaintedForests(
        ctx, width, height, heightMap, moistureMap, temperatureMap,
        terrainCfg.seaLevel, terrainCfg.mountainLevel,
        terrainCfg.forestDensity, WORLD_SEED,
    );

    // Individual trees at forest edges
    renderBookNaturalForests(ctx, terrainCfg, heightMap, moistureMap, temperatureMap, rng);

    // Mountain ridges
    const ridgePoints = findMountainRidges(
        width, height, heightMap, terrainCfg.mountainLevel, rng,
    );
    renderBookMountainRidges(ctx, terrainCfg, ridgePoints, rng);
}

// ── Region Overlays ─────────────────────────────────────────────

function renderRegionOverlays(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    width: number,
    height: number,
) {
    // Tint story-specific regions on top of procedural terrain.
    // The Calyndra borderlands have distinct zones:
    //   - Thalanor (far west): near-black ancient dark forest
    //   - Waldmeer (west-central): dense old-growth forest, dark green
    //   - Nebelfelder (east): misty open plains
    //   - Weideland (north-east): golden pasturelands
    //   - Kingdom proper (far east): cultivated, open

    for (const region of data.featureRegions) {
        if (!region.svgPath) continue;

        const points = parseSVGPath(region.svgPath);
        const scaled = scalePoints(points, VIEW_W, VIEW_H, width, height);

        switch (region.type) {
            case 'darkwood': {
                // Thalanor: near-black ancient forest, almost opaque.
                // First a solid dark base to hide any terrain underneath
                ctx.save();
                drawPointPath(ctx, scaled, true);
                ctx.fillStyle = '#080c04';
                ctx.fill();
                // Then a subtle green-black gradient for depth
                const dGrad = ctx.createLinearGradient(0, 0, scaled[0]?.x ?? 0, height);
                dGrad.addColorStop(0, 'rgba(5, 12, 3, 0.9)');
                dGrad.addColorStop(1, 'rgba(2, 4, 1, 0.95)');
                ctx.fillStyle = dGrad;
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'forest': {
                // Waldmeer: dense old-growth, dark green canopy.
                // Solid base layer so no terrain water peeks through
                ctx.save();
                drawPointPath(ctx, scaled, true);
                ctx.fillStyle = 'rgba(15, 30, 8, 0.65)';
                ctx.fill();
                // Tree-canopy noise texture on top
                const noise = new SimplexNoise(WORLD_SEED + 500);
                ctx.clip();
                for (let y = 0; y < height; y += 5) {
                    for (let x = 0; x < width; x += 5) {
                        const n = noise.noise2D(x / 30, y / 30);
                        if (n > -0.1) {
                            const g = 18 + n * 12;
                            ctx.fillStyle = `rgba(${g * 0.4}, ${g}, ${g * 0.3}, ${0.15 + n * 0.1})`;
                            ctx.fillRect(x, y, 5, 5);
                        }
                    }
                }
                ctx.restore();
                break;
            }
            default:
                continue;
        }
    }

    // Fog/mist effect for the Nebelfelder region
    for (const region of data.featureRegions) {
        if (!region.fogEffect) continue;
        const { cx, cy, rx, ry } = region.fogEffect;
        const p = scaleCoord(cx, cy, VIEW_W, VIEW_H, width, height);
        const sRx = (rx / VIEW_W) * width;
        const sRy = (ry / VIEW_H) * height;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(sRx, sRy));
        gradient.addColorStop(0, 'rgba(200, 210, 220, 0.18)');
        gradient.addColorStop(0.5, 'rgba(170, 180, 190, 0.10)');
        gradient.addColorStop(1, 'rgba(140, 150, 160, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, sRx, sRy, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Hills in the pastureland — gentle elevation bumps
    for (const hill of data.hills) {
        for (const shape of hill.shapes) {
            const p = scaleCoord(shape.cx, shape.cy, VIEW_W, VIEW_H, width, height);
            const rx = (shape.rx / VIEW_W) * width;
            const ry = (shape.ry / VIEW_H) * height;

            const grad = ctx.createRadialGradient(p.x, p.y - ry * 0.3, 0, p.x, p.y, Math.max(rx, ry));
            grad.addColorStop(0, `rgba(180, 160, 100, ${shape.opacity * 0.15})`);
            grad.addColorStop(1, 'rgba(120, 110, 70, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ── World Paths ─────────────────────────────────────────────────

function renderWorldPaths(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    chapter: number,
    width: number,
    height: number,
) {
    const visibleIds = new Set(
        getVisibleLocations(data, chapter).map(l => l.id),
    );

    for (const path of data.worldPaths) {
        if (!visibleIds.has(path.from) || !visibleIds.has(path.to)) continue;

        const points = parseSVGPath(path.svgPath);
        const scaled = scalePoints(points, VIEW_W, VIEW_H, width, height);
        if (scaled.length === 0) continue;

        ctx.save();
        ctx.strokeStyle = path.style.stroke;
        ctx.lineWidth = path.style.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (path.style.dash) {
            const dashes = path.style.dash.split(',').map(Number);
            ctx.setLineDash(dashes);
        }

        drawPointPath(ctx, scaled);
        ctx.stroke();
        ctx.restore();
    }
}

// ── Location Nodes ──────────────────────────────────────────────

function renderLocationNodes(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    visibleLocations: StoryLocation[],
    chapter: number,
    width: number,
    height: number,
    showLabels: boolean,
) {
    for (const loc of visibleLocations) {
        const p = scaleCoord(
            loc.coordinates.x, loc.coordinates.y,
            VIEW_W, VIEW_H, width, height,
        );
        const destroyed = isLocationDestroyed(loc, chapter);

        // Type-specific icon rendering
        ctx.save();
        if (destroyed) {
            ctx.globalAlpha = 0.6;
        }
        renderLocationIcon(ctx, loc, p.x, p.y, destroyed);
        ctx.restore();

        // Label
        if (showLabels) {
            ctx.save();
            ctx.font = loc.type === 'village'
                ? 'bold 11px "Palatino Linotype", serif'
                : '10px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            const labelY = p.y + getLabelOffset(loc.type);

            // Shadow for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText(loc.name.de, p.x + 1, labelY + 1);
            ctx.fillStyle = destroyed ? '#c87868' : '#e8dcc8';
            ctx.fillText(loc.name.de, p.x, labelY);
            ctx.restore();
        }
    }
}

function getLabelOffset(type: string): number {
    switch (type) {
        case 'village': return 18;
        case 'farm': return 14;
        case 'water': return 12;
        default: return 10;
    }
}

function renderLocationIcon(
    ctx: CanvasRenderingContext2D,
    loc: StoryLocation,
    x: number,
    y: number,
    destroyed: boolean,
) {
    switch (loc.type) {
        case 'village':
            // Cluster of small houses
            drawHumanHouse(ctx, x - 8, y - 4, 10, {});
            drawHumanHouse(ctx, x + 4, y - 6, 8, {});
            drawHumanHouse(ctx, x - 2, y + 2, 9, {});
            if (destroyed) {
                renderDestroyedOverlay(ctx, x, y, 18);
            }
            break;
        case 'farm':
            // Single farmhouse with fence
            drawHumanHouse(ctx, x - 4, y - 4, 10, {});
            ctx.strokeStyle = '#8a7a5a';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 10, y + 2, 20, 8);
            if (destroyed) renderDestroyedOverlay(ctx, x, y, 14);
            break;
        case 'water':
            // Blue circle (pond)
            ctx.beginPath();
            ctx.ellipse(x, y, 10, 7, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(60, 100, 140, 0.6)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(80, 120, 160, 0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
        case 'landmark':
            // Large tree
            drawTree(ctx, x, y - 6, 16, {});
            break;
        case 'hollow':
            // Dark depression
            ctx.beginPath();
            ctx.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(40, 30, 20, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(80, 60, 40, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
        case 'shelter':
            // Small shelter / burrow entrance
            ctx.beginPath();
            ctx.arc(x, y, 6, Math.PI, 0);
            ctx.fillStyle = 'rgba(60, 50, 30, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 80, 50, 0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
        case 'cabin':
            // Single cabin
            drawHumanHouse(ctx, x - 5, y - 5, 11, {});
            break;
        case 'darkwood':
            // Dark, menacing trees
            ctx.globalAlpha = 0.7;
            drawTree(ctx, x - 5, y - 4, 12, {});
            drawTree(ctx, x + 3, y - 6, 14, {});
            ctx.globalAlpha = 1;
            break;
        default:
            // Fallback dot
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#c4873a';
            ctx.fill();
    }
}

function renderDestroyedOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    // Red-tinted smoke/ruin indicator
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(200, 60, 30, 0.3)');
    gradient.addColorStop(0.6, 'rgba(100, 30, 15, 0.15)');
    gradient.addColorStop(1, 'rgba(60, 20, 10, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Smoke wisps
    ctx.strokeStyle = 'rgba(120, 100, 80, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const sx = x - 6 + i * 6;
        ctx.beginPath();
        ctx.moveTo(sx, y - 4);
        ctx.bezierCurveTo(sx - 2, y - 10, sx + 3, y - 16, sx - 1, y - 22);
        ctx.stroke();
    }
}

// ── Character Markers ───────────────────────────────────────────

function renderCharacterMarkers(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    visibleLocations: StoryLocation[],
    chapter: number,
    width: number,
    height: number,
) {
    for (const loc of visibleLocations) {
        const chars = getCharactersAtLocation(data, loc.id, chapter);
        if (chars.length === 0) continue;

        const base = scaleCoord(
            loc.coordinates.x, loc.coordinates.y,
            VIEW_W, VIEW_H, width, height,
        );

        const spread = 14;
        const startAngle = -Math.PI / 2 - ((chars.length - 1) * 0.35) / 2;

        for (let i = 0; i < chars.length; i++) {
            const angle = startAngle + i * 0.35;
            const cx = base.x + Math.cos(angle) * spread;
            const cy = base.y + Math.sin(angle) * spread;

            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = chars[i].colors.primary;
            ctx.fill();
            ctx.strokeStyle = chars[i].colors.stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

// ── Supernatural Indicators ─────────────────────────────────────

function renderSupernaturalIndicators(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    visibleLocations: StoryLocation[],
    chapter: number,
    width: number,
    height: number,
) {
    for (const loc of visibleLocations) {
        const effects = getSupernaturalAtLocation(data, loc.id, chapter);
        if (effects.length === 0) continue;

        const p = scaleCoord(
            loc.coordinates.x, loc.coordinates.y,
            VIEW_W, VIEW_H, width, height,
        );

        const pulseRadius = 25 + effects.length * 5;

        let glowR = 100, glowG = 60, glowB = 180;
        for (const eff of effects) {
            if (eff.id.includes('red') || eff.id.includes('veinlight') || eff.id.includes('stillbrand')) {
                glowR = 180; glowG = 40; glowB = 40;
            } else if (eff.id.includes('blue') || eff.id.includes('healing')) {
                glowR = 60; glowG = 120; glowB = 220;
            } else if (eff.id.includes('oak') || eff.id.includes('gray')) {
                glowR = 160; glowG = 140; glowB = 60;
            }
        }

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseRadius);
        gradient.addColorStop(0, `rgba(${glowR}, ${glowG}, ${glowB}, 0.2)`);
        gradient.addColorStop(0.5, `rgba(${glowR}, ${glowG}, ${glowB}, 0.07)`);
        gradient.addColorStop(1, `rgba(${glowR}, ${glowG}, ${glowB}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Title ───────────────────────────────────────────────────────

function renderTitle(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    chapter: number,
    width: number,
) {
    const title = data.meta.mapTitle;
    const chapterLabel = chapter === 0 ? 'Prolog' : `Kapitel ${chapter}`;

    ctx.save();
    ctx.font = 'small-caps bold 16px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Text shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(title, width / 2 + 1, 13);
    ctx.fillStyle = '#c4873a';
    ctx.fillText(title, width / 2, 12);

    ctx.font = '11px "Palatino Linotype", serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(chapterLabel, width / 2 + 1, 31);
    ctx.fillStyle = '#9a8a6a';
    ctx.fillText(chapterLabel, width / 2, 30);
    ctx.restore();
}

// ── Clickable Areas ─────────────────────────────────────────────

function registerClickableAreas(
    zoomController: any,
    visibleLocations: StoryLocation[],
    width: number,
    height: number,
) {
    zoomController.clearClickableAreas();

    for (const loc of visibleLocations) {
        if (!loc.hasSubMap) continue;

        const p = scaleCoord(
            loc.coordinates.x, loc.coordinates.y,
            VIEW_W, VIEW_H, width, height,
        );

        const clickRadius = loc.type === 'village' ? 22 : 16;

        zoomController.registerClickableArea({
            shape: 'circle',
            x: p.x,
            y: p.y,
            radius: clickRadius,
            label: `${loc.name.de} (Details anzeigen)`,
            targetLevel: 'city',
            targetData: {
                name: loc.name.de,
                id: loc.id,
                seed: WORLD_SEED,
                size: loc.type === 'village' ? 'medium' : 'small',
                style: 'human',
            },
        });
    }
}
