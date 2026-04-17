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
    findMountainRidges,
} from '../../terrain';
import {
    renderParchmentTexture,
    renderHillshading,
    renderVignette,
    drawBookCompass,
    drawBookBorder,
} from '../../bookstyle';
import { renderBookTerrainOverlay } from '../worldmap/styles';
import { renderBookNaturalForests } from '../worldmap/features/forests';
import { renderBookMountainRidges } from '../worldmap/features/mountains';
import { drawTree, drawHumanHouse, drawTower, drawTemple, drawWell } from '../../assets';
import {
    getVisibleLocations,
    isLocationDestroyed,
    getCharactersAtLocation,
    getSupernaturalAtLocation,
    computeWorldBounds,
} from './data-loader';
import { buildExploredMask } from './explored-area';
import type { StoryWorldData, StoryLocation, Point } from './types';

// Fixed seed for reproducible story world terrain
const WORLD_SEED = 42;

/** The world viewport — computed dynamically from location data. */
interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Map a world coordinate to a canvas pixel using the current viewport. */
function worldToCanvas(
    wx: number, wy: number,
    view: ViewRect, canvasW: number, canvasH: number,
): Point {
    return {
        x: ((wx - view.x) / view.w) * canvasW,
        y: ((wy - view.y) / view.h) * canvasH,
    };
}

/** Scale a set of world-coord points to canvas pixels. */
function worldPointsToCanvas(
    points: readonly Point[],
    view: ViewRect, canvasW: number, canvasH: number,
): Point[] {
    return points.map(p => worldToCanvas(p.x, p.y, view, canvasW, canvasH));
}

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

    // Compute dynamic viewport from ALL location positions.
    // This is the key to "the map grows with your story": adding a
    // location far away auto-extends the bounds.
    const view = computeWorldBounds(data);

    // ── 1. Terra Incognita background ──
    renderTerraIncognita(ctx, width, height);

    // ── 2. Terrain + explored-area mask ──
    const visibleLocations = getVisibleLocations(data, chapter);

    if (useExploredArea && visibleLocations.length > 0) {
        const terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = width;
        terrainCanvas.height = height;
        const terrainCtx = terrainCanvas.getContext('2d')!;

        renderProceduralTerrain(terrainCtx, width, height);

        const mask = buildExploredMask(data, chapter, view, width, height, radiusMultiplier);
        terrainCtx.globalCompositeOperation = 'destination-in';
        terrainCtx.drawImage(mask, 0, 0);
        terrainCtx.globalCompositeOperation = 'source-over';

        ctx.drawImage(terrainCanvas, 0, 0);
    } else {
        renderProceduralTerrain(ctx, width, height);
    }

    // ── 3. Paths ──
    if (showPaths) {
        renderWorldPaths(ctx, data, chapter, view, width, height);
    }

    // ── 4. Location nodes ──
    renderLocationNodes(ctx, data, visibleLocations, chapter, view, width, height, showLabels);

    // ── 5. Character markers ──
    if (showCharacters) {
        renderCharacterMarkers(ctx, data, visibleLocations, chapter, view, width, height);
    }

    // ── 6. Supernatural indicators ──
    if (showSupernatural) {
        renderSupernaturalIndicators(ctx, data, visibleLocations, chapter, view, width, height);
    }

    // ── 7. Terra Incognita labels ──
    if (useExploredArea && visibleLocations.length > 0) {
        renderTerraIncognitaLabel(ctx, data, chapter, width, height);
    }

    // ── 8. Border + compass + title ──
    drawBookBorder(ctx, width, height, { color: '#3a2a18' });
    drawBookCompass(ctx, width - 50, height - 55, 35, {});
    renderTitle(ctx, data, chapter, width);

    // ── 9. Vignette ──
    renderVignette(ctx, width, height, 0.3);

    // ── 10. Clickable areas ──
    if (zoomController) {
        registerClickableAreas(zoomController, visibleLocations, view, width, height);
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
        seaLevel: 0.0,
        mountainLevel: 0.88,
        mapStyle: 'book',
        forestDensity: 0.85,
        riverCount: 0,
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

    // Bias moisture: west = dense forest, east = open farmland.
    // The story geography has Thalanor/Waldmeer (ancient forest)
    // on the left and Calyndra (cultivated kingdom) on the right.
    // Spiegelteich (x ~400 in view coords, ~40% of width) is the
    // approximate forest-farmland transition.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const t = x / width; // 0 = far west, 1 = far east
            // West: boost moisture to 0.8+ (dense forest)
            // East: reduce moisture to 0.2- (open fields)
            const forestBias = 1.0 - t; // 1.0 in west, 0.0 in east
            const biased = moistureMap[idx] * 0.3 + forestBias * 0.7;
            moistureMap[idx] = biased;
        }
    }

    // Parchment base texture
    renderParchmentTexture(ctx, width, height, WORLD_SEED);

    // Book-style terrain overlay (biome colors reflect the biased
    // moisture: green-brown forest tones in west, warm golden
    // farmland tones in east)
    renderBookTerrainOverlay(ctx, terrainCfg, heightMap, moistureMap);

    // Hillshading for gentle rolling-hills depth
    renderHillshading(ctx, width, height, heightMap, {
        strength: 0.25,
        ambient: 0.45,
    });

    // Individual trees — density follows the biased moisture map,
    // so the west gets dense tree coverage (forest) and the east
    // stays open (farmland with scattered trees).
    renderBookNaturalForests(ctx, terrainCfg, heightMap, moistureMap, temperatureMap, rng);

    // Gentle mountain ridges (only the tallest hills get peaks)
    const ridgePoints = findMountainRidges(
        width, height, heightMap, terrainCfg.mountainLevel, rng,
    );
    renderBookMountainRidges(ctx, terrainCfg, ridgePoints, rng);
}

// ── (Region Overlays removed — terrain biome gradient handles
//     forest/farmland transition directly via moisture bias) ──

// ── World Paths ─────────────────────────────────────────────────

function renderWorldPaths(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    chapter: number,
    view: ViewRect,
    width: number,
    height: number,
) {
    const visibleIds = new Set(
        getVisibleLocations(data, chapter).map(l => l.id),
    );

    for (const path of data.worldPaths) {
        if (!visibleIds.has(path.from) || !visibleIds.has(path.to)) continue;

        const points = parseSVGPath(path.svgPath);
        const scaled = worldPointsToCanvas(points, view, width, height);
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
    view: ViewRect,
    width: number,
    height: number,
    showLabels: boolean,
) {
    for (const loc of visibleLocations) {
        const p = worldToCanvas(
            loc.coordinates.x, loc.coordinates.y,
            view, width, height,
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
    view: ViewRect,
    width: number,
    height: number,
) {
    for (const loc of visibleLocations) {
        const chars = getCharactersAtLocation(data, loc.id, chapter);
        if (chars.length === 0) continue;

        const base = worldToCanvas(
            loc.coordinates.x, loc.coordinates.y,
            view, width, height,
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
    view: ViewRect,
    width: number,
    height: number,
) {
    for (const loc of visibleLocations) {
        const effects = getSupernaturalAtLocation(data, loc.id, chapter);
        if (effects.length === 0) continue;

        const p = worldToCanvas(
            loc.coordinates.x, loc.coordinates.y,
            view, width, height,
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
    view: ViewRect,
    width: number,
    height: number,
) {
    zoomController.clearClickableAreas();

    for (const loc of visibleLocations) {
        if (!loc.hasSubMap) continue;

        const p = worldToCanvas(
            loc.coordinates.x, loc.coordinates.y,
            view, width, height,
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
