/**
 * Detail-map renderer for a single Story-Map location.
 *
 * Called from the StoryMapGenerator when cfg._viewLevel === 'detail'.
 * Unlike the world overview (which shows nodes in world coordinates),
 * the detail map renders a single location's buildings in the
 * location's local svgSize coordinate space, fitted to the canvas.
 *
 * Data sources:
 *   - loc.buildings — authored positions, minChapter/destroyedChapter
 *   - data.rivers   — rivers tagged with a matching locationId
 *   - data.localPaths[locationId] — local roads/trails
 *   - data.characters — by locationId + buildingId + chapters
 *   - data.supernaturalElements — by locationId + minChapter
 */

import { SimplexNoise } from '../../noise';
import {
    drawHumanHouse,
    drawTemple,
    drawTower,
    drawWell,
    drawTree,
    drawBridge,
} from '../../assets';
import { parseSVGPath, drawPointPath } from './svg-path';
import {
    getVisibleBuildings,
    isBuildingDestroyed,
    isLocationDestroyed,
    getCharactersAtLocation,
    getSupernaturalAtLocation,
} from './data-loader';
import type {
    StoryWorldData,
    StoryLocation,
    StoryBuilding,
    Point,
} from './types';

const PADDING = 48;

interface Fit {
    /** scale factor from svg → canvas */
    s: number;
    /** canvas offset where svg(0,0) lands */
    offX: number;
    offY: number;
    /** effective drawing box */
    boxW: number;
    boxH: number;
}

function computeFit(loc: StoryLocation, canvasW: number, canvasH: number): Fit {
    const svgW = loc.svgSize?.w ?? 600;
    const svgH = loc.svgSize?.h ?? 480;
    const availW = canvasW - PADDING * 2;
    const availH = canvasH - PADDING * 2 - 60; // reserve for title
    const s = Math.min(availW / svgW, availH / svgH);
    const boxW = svgW * s;
    const boxH = svgH * s;
    const offX = (canvasW - boxW) / 2;
    const offY = PADDING + 60 + (availH - boxH) / 2;
    return { s, offX, offY, boxW, boxH };
}

function toCanvas(fit: Fit, x: number, y: number): Point {
    return { x: fit.offX + x * fit.s, y: fit.offY + y * fit.s };
}

/** Scale parsed SVG path points using the detail fit. */
function scalePathPoints(points: readonly Point[], fit: Fit): Point[] {
    return points.map(p => toCanvas(fit, p.x, p.y));
}

// ── Public entry point ──────────────────────────────────────────

export function renderDetailMap(
    ctx: CanvasRenderingContext2D,
    cfg: Record<string, unknown>,
    data: StoryWorldData,
    locationId: string,
    chapter: number,
) {
    const loc = data.locationById.get(locationId);
    if (!loc) return;

    const width = cfg.width as number;
    const height = cfg.height as number;
    const showPaths = cfg.showPaths !== false;
    const showCharacters = cfg.showCharacters !== false;
    const showSupernatural = cfg.showSupernatural !== false;
    const showLabels = cfg.showLabels !== false;

    const fit = computeFit(loc, width, height);
    const destroyed = isLocationDestroyed(loc, chapter);

    // 1. Canvas background (outside the detail box)
    renderFrameBackground(ctx, width, height);

    // 2. Ground texture within the fit box
    renderGroundTexture(ctx, fit, loc.type, destroyed);

    // 3. Pond (if present on this location)
    if (loc.pond) {
        renderPond(ctx, fit, loc.pond);
    }

    // 4. River through this location
    const river = data.rivers.find(r => r.locationId === locationId);
    if (river) {
        renderLocalRiver(ctx, fit, river.svgPath, river.width);
        for (const cr of river.crossings) {
            if (cr.type === 'bridge' && cr.position) {
                const p = toCanvas(fit, cr.position.x + cr.position.w / 2, cr.position.y + cr.position.h / 2);
                drawBridge(ctx, p.x, p.y, Math.max(14, cr.position.w * fit.s), 0);
            } else if (cr.type === 'ford' && cr.stones) {
                ctx.fillStyle = '#8a7a5a';
                for (const st of cr.stones) {
                    const p = toCanvas(fit, st.x, st.y);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // 5. Local paths
    if (showPaths) {
        renderLocalPaths(ctx, fit, data, locationId);
    }

    // 6. Buildings (chapter-filtered)
    const visibleBuildings = getVisibleBuildings(data, locationId, chapter);
    for (const b of visibleBuildings) {
        renderBuilding(ctx, fit, b, chapter, showLabels);
    }

    // 7. Characters at buildings
    if (showCharacters) {
        renderCharactersAtBuildings(ctx, fit, data, loc, visibleBuildings, chapter);
    }

    // 8. Supernatural auras
    if (showSupernatural) {
        renderSupernatural(ctx, fit, data, loc, visibleBuildings, chapter);
    }

    // 9. Frame around the detail box
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(fit.offX, fit.offY, fit.boxW, fit.boxH);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(fit.offX + 4, fit.offY + 4, fit.boxW - 8, fit.boxH - 8);
    ctx.restore();

    // 10. Title + subtitle + back hint
    renderDetailTitle(ctx, loc, chapter, width);
    renderBackHint(ctx, width, height);
}

// ── Frame background ────────────────────────────────────────────

function renderFrameBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.7,
    );
    gradient.addColorStop(0, '#241a10');
    gradient.addColorStop(1, '#0c0804');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

// ── Ground texture ──────────────────────────────────────────────

const GROUND_TONES: Record<string, [number, number, number]> = {
    village: [130, 110, 70],   // worn dirt + grass
    farm: [150, 130, 80],      // drier meadow
    water: [70, 100, 120],     // pondside
    landmark: [100, 120, 70],  // grassy clearing
    hollow: [70, 55, 35],      // dark hollow
    shelter: [90, 75, 50],     // forest floor
    cabin: [110, 95, 65],      // forest path
    darkwood: [45, 40, 30],    // menacing
};

function renderGroundTexture(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    type: string,
    destroyed: boolean,
) {
    const [r, g, b] = GROUND_TONES[type] ?? [110, 95, 65];
    const tr = destroyed ? Math.round(r * 0.7 + 60) : r;
    const tg = destroyed ? Math.round(g * 0.6 + 20) : g;
    const tb = destroyed ? Math.round(b * 0.5 + 10) : b;

    ctx.save();
    ctx.beginPath();
    ctx.rect(fit.offX, fit.offY, fit.boxW, fit.boxH);
    ctx.clip();

    ctx.fillStyle = `rgb(${tr}, ${tg}, ${tb})`;
    ctx.fillRect(fit.offX, fit.offY, fit.boxW, fit.boxH);

    // Soft noise grain
    const noise = new SimplexNoise(137);
    const step = 3;
    for (let y = fit.offY; y < fit.offY + fit.boxH; y += step) {
        for (let x = fit.offX; x < fit.offX + fit.boxW; x += step) {
            const n = noise.noise2D(x / 40, y / 40);
            const nn = noise.noise2D(x / 12, y / 12) * 0.4;
            const shade = n + nn;
            if (shade > 0.1) {
                ctx.fillStyle = `rgba(${tr + 20}, ${tg + 15}, ${tb + 8}, ${Math.min(0.3, shade * 0.3)})`;
                ctx.fillRect(x, y, step, step);
            } else if (shade < -0.2) {
                ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.3, -shade * 0.35)})`;
                ctx.fillRect(x, y, step, step);
            }
        }
    }

    // Inner vignette to sell the "map window" feel
    const gradient = ctx.createRadialGradient(
        fit.offX + fit.boxW / 2, fit.offY + fit.boxH / 2, 0,
        fit.offX + fit.boxW / 2, fit.offY + fit.boxH / 2,
        Math.max(fit.boxW, fit.boxH) * 0.7,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(fit.offX, fit.offY, fit.boxW, fit.boxH);

    ctx.restore();
}

// ── Pond ────────────────────────────────────────────────────────

function renderPond(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    pond: { cx: number; cy: number; rx: number; ry: number },
) {
    const c = toCanvas(fit, pond.cx, pond.cy);
    const rx = pond.rx * fit.s;
    const ry = pond.ry * fit.s;
    ctx.save();
    ctx.fillStyle = 'rgba(40, 80, 110, 0.85)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 200, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Subtle highlight
    ctx.fillStyle = 'rgba(180, 210, 230, 0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x - rx * 0.3, c.y - ry * 0.35, rx * 0.4, ry * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ── River ───────────────────────────────────────────────────────

function renderLocalRiver(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    svgPath: string,
    widthPx: number,
) {
    const points = scalePathPoints(parseSVGPath(svgPath), fit);
    if (points.length === 0) return;

    const w = Math.max(4, widthPx * fit.s * 0.5);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = 'rgba(30, 70, 100, 0.5)';
    ctx.lineWidth = w * 1.4;
    drawPointPath(ctx, points);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(70, 120, 160, 0.9)';
    ctx.lineWidth = w;
    drawPointPath(ctx, points);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(160, 200, 225, 0.55)';
    ctx.lineWidth = Math.max(1, w * 0.35);
    drawPointPath(ctx, points);
    ctx.stroke();

    ctx.restore();
}

// ── Local paths ─────────────────────────────────────────────────

const PATH_STYLES: Record<string, { stroke: string; width: number; dash: number[] | null }> = {
    main:      { stroke: '#b8a070', width: 3,   dash: null },
    secondary: { stroke: '#a08a60', width: 2.2, dash: null },
    pilgrim:   { stroke: '#c9a84c', width: 2.4, dash: null },
    trail:     { stroke: '#8a7050', width: 1.4, dash: [5, 4] },
};

function renderLocalPaths(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    data: StoryWorldData,
    locationId: string,
) {
    const paths = data.localPaths[locationId];
    if (!paths || paths.length === 0) return;

    for (const path of paths) {
        const points = scalePathPoints(parseSVGPath(path.svgPath), fit);
        if (points.length === 0) continue;

        const style = PATH_STYLES[path.type] ?? PATH_STYLES.trail;

        ctx.save();
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (style.dash) ctx.setLineDash(style.dash);

        drawPointPath(ctx, points);
        ctx.stroke();
        ctx.restore();
    }
}

// ── Buildings ───────────────────────────────────────────────────

function renderBuilding(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    b: StoryBuilding,
    chapter: number,
    showLabels: boolean,
) {
    const destroyed = isBuildingDestroyed(b, chapter);
    const p = toCanvas(fit, b.position.x + b.position.w / 2, b.position.y + b.position.h / 2);
    const size = Math.max(10, Math.max(b.position.w, b.position.h) * fit.s);

    ctx.save();
    if (destroyed) ctx.globalAlpha = 0.55;

    switch (b.type) {
        case 'temple':
            drawTemple(ctx, p.x, p.y, size, {});
            break;
        case 'tower':
            drawTower(ctx, p.x, p.y, size, {});
            break;
        case 'house':
        case 'farmhouse':
        case 'cabin':
            drawHumanHouse(ctx, p.x - size / 2, p.y - size / 2, size, {});
            break;
        case 'workshop':
            drawHumanHouse(ctx, p.x - size / 2, p.y - size / 2, size, {});
            drawChimneySmoke(ctx, p.x + size * 0.1, p.y - size * 0.3);
            break;
        case 'guard': {
            // Small guard post: wooden shack with flag
            const s = size;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = '#6a4a2a';
            ctx.fillRect(-s * 0.35, -s * 0.2, s * 0.7, s * 0.4);
            ctx.fillStyle = '#4a3018';
            ctx.beginPath();
            ctx.moveTo(-s * 0.4, -s * 0.2);
            ctx.lineTo(0, -s * 0.5);
            ctx.lineTo(s * 0.4, -s * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#3a2a18';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s * 0.2, -s * 0.4);
            ctx.lineTo(s * 0.2, -s * 0.7);
            ctx.stroke();
            ctx.fillStyle = '#b84040';
            ctx.fillRect(s * 0.2, -s * 0.7, s * 0.2, s * 0.12);
            ctx.restore();
            break;
        }
        case 'well':
            drawWell(ctx, p.x, p.y, size);
            break;
        case 'square': {
            // Market square: light-toned rectangle with stall dots
            const w = b.position.w * fit.s;
            const h = b.position.h * fit.s;
            ctx.fillStyle = 'rgba(200, 175, 130, 0.55)';
            ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
            ctx.strokeStyle = 'rgba(110, 85, 50, 0.7)';
            ctx.lineWidth = 1;
            ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
            // Stall markers
            ctx.fillStyle = '#a86030';
            for (let i = 0; i < 4; i++) {
                const sx = p.x - w / 2 + w * (0.2 + i * 0.2);
                const sy = p.y - h / 2 + h * 0.3;
                ctx.fillRect(sx - 3, sy - 2, 6, 4);
            }
            break;
        }
        case 'garden': {
            // Herb garden: tidy green patch with stripes
            const w = b.position.w * fit.s;
            const h = b.position.h * fit.s;
            ctx.fillStyle = 'rgba(90, 130, 70, 0.75)';
            ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
            ctx.strokeStyle = 'rgba(55, 80, 40, 0.6)';
            ctx.lineWidth = 0.8;
            for (let r = 0; r < 4; r++) {
                const ry = p.y - h / 2 + (h / 4) * r + h / 8;
                ctx.beginPath();
                ctx.moveTo(p.x - w / 2 + 1, ry);
                ctx.lineTo(p.x + w / 2 - 1, ry);
                ctx.stroke();
            }
            break;
        }
        case 'pen': {
            // Animal pen: fenced rectangle
            const w = b.position.w * fit.s;
            const h = b.position.h * fit.s;
            ctx.fillStyle = 'rgba(120, 100, 70, 0.35)';
            ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
            ctx.strokeStyle = '#5a3a1a';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
            // Fence posts
            ctx.fillStyle = '#3a2a18';
            const posts = 5;
            for (let i = 0; i <= posts; i++) {
                const px = p.x - w / 2 + (w / posts) * i;
                ctx.fillRect(px - 1, p.y - h / 2 - 2, 2, 4);
                ctx.fillRect(px - 1, p.y + h / 2 - 2, 2, 4);
            }
            break;
        }
        case 'bakery':
            drawHumanHouse(ctx, p.x - size / 2, p.y - size / 2, size, {});
            drawChimneySmoke(ctx, p.x + size * 0.15, p.y - size * 0.3);
            break;
        default:
            // Natural features: clearing, stones, bridge, oak, slope, hollow, etc.
            renderNaturalFeature(ctx, b, p, fit);
            break;
    }

    if (destroyed) {
        renderRuinOverlay(ctx, p.x, p.y, size);
    }
    ctx.restore();

    // Label
    if (showLabels) {
        renderBuildingLabel(ctx, b, p, size, destroyed);
    }
}

function renderNaturalFeature(
    ctx: CanvasRenderingContext2D,
    b: StoryBuilding,
    p: Point,
    fit: Fit,
) {
    const w = b.position.w * fit.s;
    const h = b.position.h * fit.s;
    const rx = Math.max(6, w / 2);
    const ry = Math.max(5, h / 2);
    const id = b.id;
    const type = b.type;

    // Heuristic match by id/type substrings — the story JSON uses
    // descriptive ids like "log-bridge", "oak-trunk", "clay-slope",
    // and these don't map to a fixed enum. Fall back to a subtle
    // marker for unknowns.
    if (id.includes('bridge')) {
        drawBridge(ctx, p.x, p.y, Math.max(14, w), 0);
        return;
    }
    if (id.includes('oak') || type === 'tree' || id.includes('trunk')) {
        drawTree(ctx, p.x, p.y, Math.max(18, rx * 1.6), {});
        return;
    }
    if (id.includes('stone') || id.includes('cross') || type === 'stones') {
        ctx.fillStyle = '#7a7268';
        ctx.strokeStyle = '#3a3028';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const sx = p.x + (i - 1) * rx * 0.5;
            const sy = p.y + Math.sin(i) * ry * 0.3;
            ctx.beginPath();
            ctx.ellipse(sx, sy, Math.max(3, rx * 0.25), Math.max(2, ry * 0.2), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        return;
    }
    if (id.includes('clearing') || id.includes('rim') || id.includes('slope')) {
        ctx.fillStyle = 'rgba(140, 160, 90, 0.4)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 100, 50, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }
    if (id.includes('hollow') || id.includes('chamber') || id.includes('bed') || id.includes('spot')) {
        ctx.fillStyle = 'rgba(50, 40, 30, 0.75)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 70, 50, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
    }
    // Fallback marker
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#c4873a';
    ctx.fill();
}

function drawChimneySmoke(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 140, 120, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 3, y - 6, x + 3, y - 12, x - 1, y - 18);
    ctx.stroke();
    ctx.restore();
}

function renderRuinOverlay(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number,
) {
    const r = size * 0.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(200, 70, 30, 0.35)');
    g.addColorStop(0.6, 'rgba(90, 30, 15, 0.18)');
    g.addColorStop(1, 'rgba(60, 20, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120, 100, 80, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const sx = x - 5 + i * 5;
        ctx.beginPath();
        ctx.moveTo(sx, y - 2);
        ctx.bezierCurveTo(sx - 3, y - 10, sx + 3, y - 18, sx - 1, y - 26);
        ctx.stroke();
    }
}

function renderBuildingLabel(
    ctx: CanvasRenderingContext2D,
    b: StoryBuilding,
    p: Point,
    size: number,
    destroyed: boolean,
) {
    const text = b.label.de;
    if (!text) return;

    ctx.save();
    ctx.font = '11px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(text);
    const padX = 4;
    const w = metrics.width + padX * 2;
    const h = 14;
    const labelY = p.y + size * 0.7 + 2;

    ctx.fillStyle = destroyed
        ? 'rgba(50, 15, 10, 0.85)'
        : 'rgba(248, 232, 196, 0.88)';
    ctx.fillRect(p.x - w / 2, labelY - h / 2, w, h);

    ctx.strokeStyle = destroyed ? 'rgba(120, 40, 20, 0.8)' : 'rgba(90, 60, 30, 0.6)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(p.x - w / 2, labelY - h / 2, w, h);

    ctx.fillStyle = destroyed ? '#ffc8b0' : '#2a1810';
    ctx.fillText(text, p.x, labelY);
    ctx.restore();
}

// ── Characters ──────────────────────────────────────────────────

function renderCharactersAtBuildings(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    data: StoryWorldData,
    loc: StoryLocation,
    visibleBuildings: StoryBuilding[],
    chapter: number,
) {
    const buildingIds = new Set(visibleBuildings.map(b => b.id));
    const chars = getCharactersAtLocation(data, loc.id, chapter);
    if (chars.length === 0) return;

    // Group characters by building so markers fan out nicely
    const byBuilding = new Map<string, typeof chars>();
    for (const ch of chars) {
        for (const cl of ch.locations) {
            if (cl.locationId !== loc.id) continue;
            if (!cl.chapters.includes(chapter)) continue;
            if (!buildingIds.has(cl.buildingId)) continue;
            const list = byBuilding.get(cl.buildingId) ?? [];
            list.push(ch);
            byBuilding.set(cl.buildingId, list);
        }
    }

    for (const [buildingId, list] of byBuilding) {
        const b = visibleBuildings.find(x => x.id === buildingId);
        if (!b) continue;
        const center = toCanvas(fit, b.position.x + b.position.w / 2, b.position.y + b.position.h / 2);
        const size = Math.max(10, Math.max(b.position.w, b.position.h) * fit.s);

        const spread = Math.max(12, size * 0.55);
        const startAngle = -Math.PI / 2 - ((list.length - 1) * 0.38) / 2;
        for (let i = 0; i < list.length; i++) {
            const angle = startAngle + i * 0.38;
            const cx = center.x + Math.cos(angle) * spread;
            const cy = center.y + Math.sin(angle) * spread;

            // White halo for legibility over dark textures
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fillStyle = list[i].colors.primary;
            ctx.fill();
            ctx.strokeStyle = list[i].colors.stroke;
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
    }
}

// ── Supernatural ────────────────────────────────────────────────

function renderSupernatural(
    ctx: CanvasRenderingContext2D,
    fit: Fit,
    data: StoryWorldData,
    loc: StoryLocation,
    visibleBuildings: StoryBuilding[],
    chapter: number,
) {
    const effects = getSupernaturalAtLocation(data, loc.id, chapter);
    if (effects.length === 0) return;

    for (const eff of effects) {
        // Position: either explicit coords (svg space) or first building
        let cx: number, cy: number;
        if (eff.position) {
            const p = toCanvas(fit, eff.position.x, eff.position.y);
            cx = p.x; cy = p.y;
        } else if (visibleBuildings.length > 0) {
            const b = visibleBuildings[0];
            const p = toCanvas(fit, b.position.x + b.position.w / 2, b.position.y + b.position.h / 2);
            cx = p.x; cy = p.y;
        } else {
            continue;
        }

        let r = 180, g = 60, b2 = 60;
        if (eff.id.includes('blue') || eff.id.includes('healing')) {
            r = 60; g = 140; b2 = 220;
        } else if (eff.id.includes('oak') || eff.id.includes('gray')) {
            r = 180; g = 160; b2 = 80;
        } else if (eff.id.includes('purple') || eff.id.includes('mist')) {
            r = 140; g = 90; b2 = 200;
        }

        const radius = 40;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b2}, 0.35)`);
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b2}, 0.10)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b2}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Title & hints ───────────────────────────────────────────────

function renderDetailTitle(
    ctx: CanvasRenderingContext2D,
    loc: StoryLocation,
    chapter: number,
    width: number,
) {
    const title = loc.name.de;
    const sub = loc.subtitle?.de;
    const chapterLabel = chapter === 0 ? 'Prolog' : `Kapitel ${chapter}`;

    ctx.save();
    ctx.font = 'small-caps bold 22px "Palatino Linotype", serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '13px "Palatino Linotype", serif';
    const subW = sub ? ctx.measureText(sub).width : 0;
    const chapterW = ctx.measureText(chapterLabel).width;
    const boxW = Math.max(titleW, subW, chapterW) + 40;
    const boxH = sub ? 68 : 52;
    const boxX = (width - boxW) / 2;
    const boxY = 8;

    ctx.fillStyle = 'rgba(248, 232, 196, 0.95)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);

    ctx.font = 'small-caps bold 22px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#2a1810';
    ctx.fillText(title, width / 2, boxY + 8);

    if (sub) {
        ctx.font = 'italic 13px "Palatino Linotype", serif';
        ctx.fillStyle = '#6a4a2a';
        ctx.fillText(sub, width / 2, boxY + 33);
        ctx.font = '12px "Palatino Linotype", serif';
        ctx.fillStyle = '#8a6a4a';
        ctx.fillText(chapterLabel, width / 2, boxY + 50);
    } else {
        ctx.font = '13px "Palatino Linotype", serif';
        ctx.fillStyle = '#6a4a2a';
        ctx.fillText(chapterLabel, width / 2, boxY + 33);
    }

    ctx.restore();
}

function renderBackHint(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) {
    ctx.save();
    ctx.font = 'italic 11px "Palatino Linotype", serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(196, 135, 58, 0.6)';
    ctx.fillText('← Esc: zurück zur Weltkarte', width - 14, height - 10);
    ctx.restore();
}
