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
    renderPaintedForests,
    renderVignette,
    drawBookCompass,
    drawBookBorder,
} from '../../bookstyle';
import { renderBookTerrainOverlay } from '../worldmap/styles';
import { renderBookNaturalForests } from '../worldmap/features/forests';
import { drawTree, drawHumanHouse, drawTower, drawTemple, drawWell } from '../../assets';
import { parseSVGPath, drawPointPath } from './svg-path';
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
        scale: 6,
        continentShape: 'pangaea',
        seaLevel: 0.02,
        mountainLevel: 0.82,
        mapStyle: 'book',
        forestDensity: 0.9,
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

    // Bias moisture: west = dense forest, east = green pasture.
    // Use noise to create an IRREGULAR forest edge instead of a
    // straight vertical line. The boundary meanders naturally.
    const edgeNoise = new SimplexNoise(WORLD_SEED + 777);
    for (let y = 0; y < height; y++) {
        // The forest edge position varies per row via noise
        const edgeBase = 0.48;
        const edgeWobble = edgeNoise.noise2D(0, y / 80) * 0.12
            + edgeNoise.noise2D(0, y / 30) * 0.06;
        const forestEdge = edgeBase + edgeWobble;

        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const t = x / width;

            // Smooth transition centered on the noise-perturbed edge
            let forestT: number;
            if (t < forestEdge - 0.08) {
                forestT = 1; // deep forest
            } else if (t > forestEdge + 0.08) {
                forestT = 0; // open farmland
            } else {
                // Transition band with micro-noise for irregular patches
                const localNoise = edgeNoise.noise2D(x / 25, y / 25) * 0.15;
                forestT = 1 - ((t - (forestEdge - 0.08)) / 0.16) + localNoise;
                forestT = Math.max(0, Math.min(1, forestT));
            }

            const forestMoisture = 0.85;
            const farmMoisture = 0.38;
            const biased = forestT * forestMoisture + (1 - forestT) * farmMoisture;
            moistureMap[idx] = Math.max(0.28, moistureMap[idx] * 0.2 + biased * 0.8);

            // Force heightmap above sea level (removes blue patches)
            if (heightMap[idx] < 0.05) heightMap[idx] = 0.05 + Math.abs(edgeNoise.noise2D(x / 50, y / 50)) * 0.1;
        }
    }

    // Parchment base texture
    renderParchmentTexture(ctx, width, height, WORLD_SEED);

    // Book-style terrain overlay (biome colors reflect the biased
    // moisture: green-brown forest tones in west, warm golden
    // farmland tones in east)
    renderBookTerrainOverlay(ctx, terrainCfg, heightMap, moistureMap);

    // Hillshading for terrain depth and rolling hills
    renderHillshading(ctx, width, height, heightMap, {
        strength: 0.3,
        ambient: 0.4,
    });

    // Painted forest masses — creates the lush green canopy areas
    // that give the map its "Valcia" look. The moisture bias ensures
    // forests concentrate in the west (Thalanor/Waldmeer) and thin
    // out toward the east (farmland). This is the main visual
    // difference from the parchment-only look.
    renderPaintedForests(
        ctx, width, height, heightMap, moistureMap, temperatureMap,
        terrainCfg.seaLevel, terrainCfg.mountainLevel,
        terrainCfg.forestDensity, WORLD_SEED,
    );

    // Individual trees at forest edges and scattered in clearings.
    // These add the hand-drawn detail on top of the painted masses.
    renderBookNaturalForests(ctx, terrainCfg, heightMap, moistureMap, temperatureMap, rng);

    // Rolling hills on the highest terrain. The story region is
    // gentle borderland, not a mountain range — so instead of sharp
    // triangle peaks we draw soft rounded arcs in the style of old
    // hand-drawn maps. findMountainRidges gives us the highest
    // heightmap cells; we just sample a few and render low bumps.
    const ridgePoints = findMountainRidges(
        width, height, heightMap, terrainCfg.mountainLevel, rng,
    );
    renderRollingHills(ctx, ridgePoints, rng);

    // Farmland patterns in the east (dry/low-moisture areas)
    renderFarmland(ctx, width, height, moistureMap);

    // Seren river — the story-specific river that flows through
    // Willow Brook and is a key landmark in Alina's chapters.
    renderSerenRiver(ctx, width, height);
}

// ── Farmland Pattern ───────────────────────────────────────────

function renderFarmland(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    moistureMap: Float32Array,
) {
    const noise = new SimplexNoise(WORLD_SEED + 900);
    const noise2 = new SimplexNoise(WORLD_SEED + 901);
    const pathNoise = new SimplexNoise(WORLD_SEED + 902);

    const fieldColors = [
        [95, 120, 55],   // dark green
        [130, 155, 70],  // medium green
        [155, 170, 80],  // yellow-green
        [175, 160, 80],  // golden wheat
        [190, 170, 90],  // light gold
        [145, 120, 65],  // brown plowed
        [120, 105, 55],  // dark brown fallow
        [110, 140, 65],  // fresh green
    ];

    ctx.save();

    // Fields with natural gaps and density gradient
    for (let y = 25; y < height - 25; y += 16) {
        for (let x = 0; x < width - 25; x += 20) {
            const idx = y * width + Math.min(x, width - 1);
            const moisture = moistureMap[idx];
            // Only place fields where moisture is low (farmland areas)
            if (moisture > 0.55) continue;

            // Density fades near the forest edge (cluster noise)
            const clusterN = noise.noise2D(x / 100, y / 100);
            if (clusterN < -0.1) continue; // natural meadow gaps

            // Skip some spots for pasture variety
            const gapN = noise2.noise2D(x / 40, y / 40);
            if (gapN < -0.3) continue;

            // Field size varies with distance from forest
            const farmIntensity = Math.max(0, 1 - moisture * 1.5);
            const fw = 12 + Math.floor(noise2.noise2D(x / 30, y / 30) * 10) * farmIntensity;
            const fh = 8 + Math.floor(noise2.noise2D(x / 35, y / 35 + 5) * 7) * farmIntensity;
            if (fw < 5 || fh < 4) continue;

            const angle = noise.noise2D(x / 200, y / 200) * 0.18;
            const colorIdx = Math.floor((noise.noise2D(x / 45 + 10, y / 45 + 10) + 1) * 4) % fieldColors.length;
            const [cr, cg, cb] = fieldColors[colorIdx];
            const alpha = 0.5 + farmIntensity * 0.25;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);

            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
            ctx.fillRect(0, 0, fw, fh);

            ctx.strokeStyle = `rgba(70, 55, 30, ${0.25 + farmIntensity * 0.2})`;
            ctx.lineWidth = 0.6;
            ctx.strokeRect(0, 0, fw, fh);

            // Crop rows only in larger fields
            if (fw > 10 && fh > 6) {
                ctx.strokeStyle = `rgba(60, 50, 25, 0.15)`;
                ctx.lineWidth = 0.3;
                for (let ry = 3; ry < fh; ry += 3) {
                    ctx.beginPath();
                    ctx.moveTo(1, ry);
                    ctx.lineTo(fw - 1, ry);
                    ctx.stroke();
                }
            }

            ctx.restore();
        }
    }

    // 3. Hedgerow trees scattered along field edges & meadows
    for (let i = 0; i < 80; i++) {
        const fx = noise.noise2D(i * 1.7, 0) * width * 0.5 + width * 0.5;
        const fy = noise.noise2D(0, i * 1.7) * height * 0.8 + height * 0.1;
        const fidx = Math.floor(fy) * width + Math.floor(Math.min(fx, width - 1));
        if (fidx >= 0 && fidx < moistureMap.length && moistureMap[fidx] > 0.55) continue;
        const sz = Math.max(1, 2 + noise2.noise2D(i * 3, i * 7) * 2.5);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(55, 85, 35, 0.8)';
        ctx.beginPath();
        ctx.arc(fx, fy, sz, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

// ── Rolling Hills ──────────────────────────────────────────────

function renderRollingHills(
    ctx: CanvasRenderingContext2D,
    ridgePoints: { x: number; y: number }[],
    rng: { next: () => number },
) {
    if (ridgePoints.length === 0) return;

    // Thin out and cluster: one hill per ~50 sampled peak cells
    const hills: { x: number; y: number; w: number }[] = [];
    const stride = Math.max(50, Math.floor(ridgePoints.length / 8));
    for (let i = 0; i < ridgePoints.length; i += stride) {
        const pt = ridgePoints[i];
        // Jitter so multiple stride samples don't line up in a grid
        hills.push({
            x: pt.x + (rng.next() - 0.5) * 14,
            y: pt.y + (rng.next() - 0.5) * 10,
            w: 22 + rng.next() * 18,
        });
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const h of hills) {
        const w = h.w;
        const arcH = w * 0.35;

        // Soft green-brown fill under the arc (hill mass)
        ctx.fillStyle = 'rgba(110, 125, 80, 0.35)';
        ctx.beginPath();
        ctx.moveTo(h.x - w / 2, h.y);
        ctx.quadraticCurveTo(h.x, h.y - arcH * 1.4, h.x + w / 2, h.y);
        ctx.closePath();
        ctx.fill();

        // Ink contour — two short overlapping strokes for hand-drawn feel
        ctx.strokeStyle = 'rgba(70, 55, 35, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(h.x - w / 2, h.y);
        ctx.quadraticCurveTo(h.x - w * 0.15, h.y - arcH * 1.35, h.x + w * 0.1, h.y - arcH * 0.2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(h.x - w * 0.05, h.y - arcH * 0.3);
        ctx.quadraticCurveTo(h.x + w * 0.2, h.y - arcH * 1.1, h.x + w / 2, h.y);
        ctx.stroke();

        // Tiny shadow stroke under the arc for dimensionality
        ctx.strokeStyle = 'rgba(60, 45, 25, 0.3)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(h.x - w * 0.4, h.y + 1);
        ctx.quadraticCurveTo(h.x, h.y + 2, h.x + w * 0.4, h.y + 1);
        ctx.stroke();
    }

    ctx.restore();
}

// ── Seren River ────────────────────────────────────────────────

function renderSerenRiver(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    // The Seren flows from the southwest (forest edge), curves
    // THROUGH Willow Brook (world coords ~800, 292 = ~80% x, ~45% y),
    // then meanders east into the farmland.
    const noise = new SimplexNoise(WORLD_SEED + 300);

    // Key waypoints as canvas fractions
    const waypoints = [
        { x: 0.42, y: 0.65 }, // source in the forest
        { x: 0.52, y: 0.52 }, // emerging from woods
        { x: 0.62, y: 0.48 }, // approaching village area
        { x: 0.72, y: 0.43 }, // near Alwins Gehöft
        { x: 0.80, y: 0.45 }, // THROUGH Willow Brook
        { x: 0.88, y: 0.50 }, // past the village
        { x: 0.95, y: 0.55 }, // flowing east into farmland
        { x: 1.02, y: 0.52 }, // off the map edge
    ];

    // Interpolate between waypoints with meander noise
    const pathPts: { x: number; y: number }[] = [];
    for (let wi = 0; wi < waypoints.length - 1; wi++) {
        const a = waypoints[wi];
        const b = waypoints[wi + 1];
        const segs = 15;
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const bx = (a.x + (b.x - a.x) * t) * width;
            const by = (a.y + (b.y - a.y) * t) * height;
            const globalT = (wi + t) / waypoints.length;
            const meander = noise.noise2D(globalT * 8, 0) * height * 0.018;
            const small = noise.noise2D(globalT * 20, 1) * height * 0.006;
            pathPts.push({ x: bx, y: by + meander + small });
        }
    }

    ctx.save();

    // Draw river with three strokes: shadow, body, highlight
    const drawRiverStroke = (color: string, lineW: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pathPts[0].x, pathPts[0].y);
        for (let i = 1; i < pathPts.length; i++) {
            ctx.lineTo(pathPts[i].x, pathPts[i].y);
        }
        ctx.stroke();
    };

    drawRiverStroke('rgba(30, 70, 100, 0.4)', 7);   // shadow
    drawRiverStroke('rgba(70, 120, 160, 0.9)', 3.5); // body
    drawRiverStroke('rgba(140, 185, 215, 0.5)', 1.2); // highlight

    // Italic label following the river curve
    const labelIdx = Math.floor(pathPts.length * 0.55);
    const lp = pathPts[labelIdx];
    const lp1 = pathPts[labelIdx - 2];
    const lp2 = pathPts[labelIdx + 2];
    const angle = Math.atan2(lp2.y - lp1.y, lp2.x - lp1.x);
    ctx.save();
    ctx.translate(lp.x, lp.y - 9);
    ctx.rotate(angle);
    ctx.font = 'italic 12px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30, 70, 100, 0.8)';
    ctx.fillText('Seren', 0, 0);
    ctx.restore();

    ctx.restore();
}

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

        // Label with parchment cartouche for readability
        if (showLabels) {
            ctx.save();
            const isVillage = loc.type === 'village';
            const fontSize = isVillage ? 14 : 12;
            ctx.font = isVillage
                ? `bold ${fontSize}px "Palatino Linotype", serif`
                : `${fontSize}px "Palatino Linotype", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const labelY = p.y + getLabelOffset(loc.type);
            const text = loc.name.de;
            const metrics = ctx.measureText(text);
            const padX = 6;
            const padY = 3;
            const w = metrics.width + padX * 2;
            const h = fontSize + padY * 2;

            // Parchment-toned cartouche background
            const bgX = p.x - w / 2;
            const bgY = labelY - h / 2;
            ctx.fillStyle = destroyed
                ? 'rgba(60, 20, 15, 0.85)'
                : 'rgba(248, 232, 196, 0.92)';
            ctx.fillRect(bgX, bgY, w, h);

            // Ink border
            ctx.strokeStyle = destroyed
                ? 'rgba(120, 40, 20, 0.9)'
                : 'rgba(90, 60, 30, 0.8)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(bgX, bgY, w, h);

            // Text
            ctx.fillStyle = destroyed ? '#ffc8b0' : '#2a1810';
            ctx.fillText(text, p.x, labelY);
            ctx.restore();
        }
    }
}

function getLabelOffset(type: string): number {
    switch (type) {
        case 'village': return 26;
        case 'farm': return 22;
        case 'water': return 18;
        default: return 18;
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

    // Measure text for cartouche sizing
    ctx.font = 'small-caps bold 22px "Palatino Linotype", serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '13px "Palatino Linotype", serif';
    const chapterW = ctx.measureText(chapterLabel).width;
    const boxW = Math.max(titleW, chapterW) + 40;
    const boxH = 52;
    const boxX = (width - boxW) / 2;
    const boxY = 8;

    // Parchment cartouche background
    ctx.fillStyle = 'rgba(248, 232, 196, 0.95)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    // Inner border line
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);

    // Title text
    ctx.font = 'small-caps bold 22px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#2a1810';
    ctx.fillText(title, width / 2, boxY + 8);

    // Chapter label
    ctx.font = '13px "Palatino Linotype", serif';
    ctx.fillStyle = '#6a4a2a';
    ctx.fillText(chapterLabel, width / 2, boxY + 33);
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
            // Use 'region' level (instead of 'city') so App.tsx's
            // zoom sync does NOT swap in the procedural citymap
            // generator. The storymap handles its own detail view
            // via _viewLevel='detail' + _detailLocationId config.
            targetLevel: 'region',
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
