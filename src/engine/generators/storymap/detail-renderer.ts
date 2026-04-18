/**
 * Detail renderer for a single story location.
 *
 * When the user clicks a location on the world map, this module
 * renders a zoomed-in view showing buildings, local paths, terrain
 * features, characters, and supernatural effects — all filtered
 * by the current chapter.
 */

import { SimplexNoise } from '../../noise';
import { SeededRandom } from '../../../utils';
import {
    drawHumanHouse, drawTower, drawTemple, drawWell,
    drawTree, drawBridge, drawShrine, drawForge,
    drawWindmill, drawStatue, drawBarracks,
} from '../../assets';
import { renderParchmentTexture, renderHillshading } from '../../bookstyle';
import { generateAdvancedHeightMap } from '../../terrain';
import { parseSVGPath } from './svg-path';
import {
    getVisibleBuildings,
    isBuildingDestroyed,
    getCharactersAtLocation,
    getSupernaturalAtLocation,
} from './data-loader';
import type { StoryWorldData, StoryLocation, StoryBuilding, Point } from './types';

const WORLD_SEED = 42;

/**
 * Render a detail view of a single location.
 */
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
    const svgW = loc.svgSize?.w ?? 600;
    const svgH = loc.svgSize?.h ?? 480;

    // 1. Background terrain
    renderBackground(ctx, loc, width, height, chapter);

    // 2. Local paths
    const localPaths = data.localPaths[locationId];
    if (localPaths) {
        renderLocalPaths(ctx, localPaths, svgW, svgH, width, height);
    }

    // 3. Location-specific water features
    if (loc.pond) {
        renderPond(ctx, loc.pond, svgW, svgH, width, height);
    }
    const rivers = data.rivers.filter(r => r.locationId === locationId);
    for (const river of rivers) {
        renderLocalRiver(ctx, river, svgW, svgH, width, height);
    }

    // 4. Buildings
    const buildings = getVisibleBuildings(data, locationId, chapter);
    renderBuildings(ctx, buildings, chapter, svgW, svgH, width, height);

    // 5. Characters at this location
    const chars = getCharactersAtLocation(data, locationId, chapter);
    if (chars.length > 0) {
        renderDetailCharacters(ctx, chars, buildings, svgW, svgH, width, height);
    }

    // 6. Supernatural effects
    const effects = getSupernaturalAtLocation(data, locationId, chapter);
    if (effects.length > 0) {
        renderDetailSupernatural(ctx, effects, width, height);
    }

    // 7. Title + subtitle
    renderDetailTitle(ctx, loc, chapter, width);
}

// ── Background ──────────────────────────────────────────────────

function renderBackground(
    ctx: CanvasRenderingContext2D,
    loc: StoryLocation,
    width: number,
    height: number,
    chapter: number,
) {
    const destroyed = loc.destroyedMinChapter != null && loc.destroyedMinChapter <= chapter;
    const seed = WORLD_SEED + loc.id.charCodeAt(0) * 100;

    // Parchment base
    renderParchmentTexture(ctx, width, height, seed);

    // Generate subtle heightmap for terrain texture
    const heightMap = generateAdvancedHeightMap(width, height, {
        seed,
        scale: 12,
        continentShape: 'pangaea',
        seaLevel: 0,
    });

    renderHillshading(ctx, width, height, heightMap, {
        strength: 0.15,
        ambient: 0.55,
    });

    // Type-specific color wash
    const typeColors: Record<string, [number, number, number, number]> = {
        village:  [80, 110, 60, 0.08],
        farm:     [100, 120, 60, 0.06],
        water:    [50, 80, 100, 0.08],
        landmark: [60, 90, 40, 0.10],
        hollow:   [60, 50, 40, 0.12],
        shelter:  [70, 60, 40, 0.10],
        cabin:    [60, 80, 50, 0.08],
        darkwood: [30, 40, 20, 0.15],
    };

    const [cr, cg, cb, ca] = typeColors[loc.type] ?? [70, 80, 50, 0.08];
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${ca})`;
    ctx.fillRect(0, 0, width, height);

    // Destruction tint
    if (destroyed) {
        ctx.fillStyle = 'rgba(80, 20, 10, 0.12)';
        ctx.fillRect(0, 0, width, height);
    }

    // Surrounding trees for forest locations
    if (['landmark', 'water', 'hollow', 'shelter', 'cabin', 'darkwood'].includes(loc.type)) {
        renderSurroundingTrees(ctx, width, height, seed);
    }
}

function renderSurroundingTrees(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    seed: number,
) {
    const rng = new SeededRandom(seed + 200);
    const treeCount = 30 + Math.floor(rng.next() * 20);

    for (let i = 0; i < treeCount; i++) {
        const x = rng.nextFloat(0, width);
        const y = rng.nextFloat(0, height);
        // Trees cluster at edges, thin out toward center
        const distToCenter = Math.hypot(x - width / 2, y - height / 2);
        const maxDist = Math.hypot(width / 2, height / 2);
        const edgeFactor = distToCenter / maxDist;
        if (rng.next() > edgeFactor * 0.8 + 0.1) continue;

        const size = 8 + rng.nextFloat(0, 6);
        ctx.globalAlpha = 0.6 + edgeFactor * 0.4;
        drawTree(ctx, x, y, size, {});
    }
    ctx.globalAlpha = 1;
}

// ── Local Paths ─────────────────────────────────────────────────

function renderLocalPaths(
    ctx: CanvasRenderingContext2D,
    paths: { id: string; type: string; svgPath: string; name: { de: string } }[],
    svgW: number, svgH: number,
    width: number, height: number,
) {
    const pathStyles: Record<string, [string, number, string | null]> = {
        main:      ['rgba(140, 115, 75, 0.6)', 3, null],
        secondary: ['rgba(130, 110, 70, 0.45)', 2, null],
        trail:     ['rgba(110, 95, 60, 0.35)', 1.5, '6,4'],
        pilgrim:   ['rgba(160, 130, 60, 0.5)', 2.5, null],
    };

    for (const path of paths) {
        const pts = parseSVGPath(path.svgPath);
        if (pts.length < 2) continue;

        const scaled = pts.map(p => ({
            x: (p.x / svgW) * width,
            y: (p.y / svgH) * height,
        }));

        const [color, lineW, dash] = pathStyles[path.type] ?? pathStyles.trail;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (dash) ctx.setLineDash(dash.split(',').map(Number));

        ctx.beginPath();
        ctx.moveTo(scaled[0].x, scaled[0].y);
        for (let i = 1; i < scaled.length; i++) {
            ctx.lineTo(scaled[i].x, scaled[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }
}

// ── Water Features ──────────────────────────────────────────────

function renderPond(
    ctx: CanvasRenderingContext2D,
    pond: { cx: number; cy: number; rx: number; ry: number },
    svgW: number, svgH: number,
    width: number, height: number,
) {
    const cx = (pond.cx / svgW) * width;
    const cy = (pond.cy / svgH) * height;
    const rx = (pond.rx / svgW) * width;
    const ry = (pond.ry / svgH) * height;

    // Water fill
    const grad = ctx.createRadialGradient(cx, cy - ry * 0.2, 0, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, 'rgba(60, 110, 150, 0.7)');
    grad.addColorStop(0.7, 'rgba(50, 90, 130, 0.6)');
    grad.addColorStop(1, 'rgba(40, 80, 110, 0.3)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shore edge
    ctx.strokeStyle = 'rgba(70, 100, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function renderLocalRiver(
    ctx: CanvasRenderingContext2D,
    river: { svgPath: string; width: number },
    svgW: number, svgH: number,
    width: number, height: number,
) {
    const pts = parseSVGPath(river.svgPath);
    if (pts.length < 2) return;

    const scaled = pts.map(p => ({
        x: (p.x / svgW) * width,
        y: (p.y / svgH) * height,
    }));

    const riverW = (river.width / svgW) * width;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Shadow
    ctx.strokeStyle = 'rgba(30, 70, 100, 0.3)';
    ctx.lineWidth = riverW * 1.3;
    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    for (const p of scaled) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Body
    ctx.strokeStyle = 'rgba(70, 120, 160, 0.8)';
    ctx.lineWidth = riverW;
    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    for (const p of scaled) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Highlight
    ctx.strokeStyle = 'rgba(140, 180, 210, 0.4)';
    ctx.lineWidth = riverW * 0.4;
    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    for (const p of scaled) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.restore();
}

// ── Buildings ───────────────────────────────────────────────────

function renderBuildings(
    ctx: CanvasRenderingContext2D,
    buildings: StoryBuilding[],
    chapter: number,
    svgW: number, svgH: number,
    width: number, height: number,
) {
    for (const b of buildings) {
        const bx = (b.position.x / svgW) * width;
        const by = (b.position.y / svgH) * height;
        const bw = (b.position.w / svgW) * width;
        const bh = (b.position.h / svgH) * height;
        const destroyed = isBuildingDestroyed(b, chapter);

        ctx.save();
        if (destroyed) ctx.globalAlpha = 0.5;

        drawBuildingByType(ctx, b.type, bx, by, bw, bh);

        if (destroyed) {
            ctx.globalAlpha = 1;
            // Red X over destroyed building
            ctx.strokeStyle = 'rgba(200, 50, 30, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + bw, by + bh);
            ctx.moveTo(bx + bw, by);
            ctx.lineTo(bx, by + bh);
            ctx.stroke();
        }

        ctx.restore();

        // Building label
        ctx.save();
        ctx.font = '10px "Palatino Linotype", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = destroyed ? 'rgba(160, 60, 40, 0.8)' : 'rgba(40, 30, 15, 0.8)';
        ctx.fillText(b.label.de, bx + bw / 2, by + bh + 12);
        ctx.restore();
    }
}

function drawBuildingByType(
    ctx: CanvasRenderingContext2D,
    type: string,
    x: number, y: number,
    w: number, h: number,
) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const size = Math.max(w, h);

    switch (type) {
        case 'temple':
            drawTemple(ctx, cx, cy, size * 0.8, {});
            break;
        case 'tower':
            drawTower(ctx, cx, cy, size * 0.7, {});
            break;
        case 'house':
        case 'farmhouse':
            drawHumanHouse(ctx, cx - size * 0.2, cy - size * 0.15, size * 0.5, {});
            break;
        case 'guard':
            drawBarracks(ctx, cx, cy, size * 0.5);
            break;
        case 'garden':
            ctx.fillStyle = 'rgba(80, 130, 50, 0.4)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(60, 100, 40, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            break;
        case 'square':
            ctx.fillStyle = 'rgba(180, 165, 130, 0.5)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(120, 100, 70, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            break;
        case 'workshop':
            drawForge(ctx, cx, cy, size * 0.5);
            break;
        case 'well':
            drawWell(ctx, cx, cy, size * 0.5);
            break;
        case 'shrine':
            drawShrine(ctx, cx, cy, size * 0.5);
            break;
        case 'bridge':
            drawBridge(ctx, cx, cy, Math.max(w, h) * 0.5);
            break;
        case 'barn':
        case 'storage':
            ctx.fillStyle = 'rgba(140, 110, 60, 0.5)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(100, 75, 35, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            break;
        case 'pen':
        case 'fence':
            ctx.strokeStyle = 'rgba(100, 80, 40, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, w, h);
            break;
        case 'tree-landmark':
        case 'oak-trunk':
            drawTree(ctx, cx, cy - h * 0.3, size * 0.8, {});
            break;
        case 'clearing':
            ctx.fillStyle = 'rgba(140, 160, 90, 0.15)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'hollow-depression':
            ctx.fillStyle = 'rgba(60, 50, 35, 0.3)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(80, 65, 40, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
        case 'root-system':
        case 'root-strand':
            ctx.strokeStyle = 'rgba(90, 70, 40, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, cy);
            ctx.bezierCurveTo(x + w * 0.3, cy - h * 0.3, x + w * 0.7, cy + h * 0.3, x + w, cy);
            ctx.stroke();
            break;
        case 'burrow-entrance':
            ctx.fillStyle = 'rgba(50, 40, 25, 0.6)';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.min(w, h) / 2, Math.PI, 0);
            ctx.fill();
            ctx.strokeStyle = 'rgba(80, 65, 35, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            break;
        case 'chamber':
        case 'tunnel':
            ctx.fillStyle = 'rgba(45, 35, 22, 0.25)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(70, 55, 30, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            break;
        case 'red-pool':
            ctx.fillStyle = 'rgba(150, 40, 30, 0.4)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'healing':
            ctx.fillStyle = 'rgba(60, 120, 200, 0.2)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'web-canopy':
        case 'webbing':
            ctx.strokeStyle = 'rgba(160, 150, 140, 0.25)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * w / 2, cy + Math.sin(angle) * h / 2);
                ctx.stroke();
            }
            break;
        case 'drained':
            ctx.fillStyle = 'rgba(120, 115, 105, 0.3)';
            ctx.fillRect(x, y, w, h);
            break;
        case 'vein-cracks':
            ctx.strokeStyle = 'rgba(180, 40, 30, 0.4)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(x + w * (i / 4), y);
                ctx.lineTo(x + w * (i / 4) + w * 0.1, y + h);
                ctx.stroke();
            }
            break;
        case 'chimney':
            ctx.fillStyle = 'rgba(100, 80, 60, 0.6)';
            ctx.fillRect(x, y, w, h);
            break;
        case 'hearth':
            ctx.fillStyle = 'rgba(180, 80, 20, 0.3)';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'cabin-main':
            drawHumanHouse(ctx, cx - size * 0.25, cy - size * 0.2, size * 0.6, {});
            break;
        default:
            // Generic feature marker
            ctx.fillStyle = 'rgba(100, 90, 70, 0.25)';
            ctx.fillRect(x, y, w, h);
            break;
    }
}

// ── Characters ──────────────────────────────────────────────────

function renderDetailCharacters(
    ctx: CanvasRenderingContext2D,
    chars: { name: string; colors: { primary: string; stroke: string } }[],
    buildings: StoryBuilding[],
    svgW: number, svgH: number,
    width: number, height: number,
) {
    // Place characters near the center or at their building
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cx = width * 0.5 + (i - chars.length / 2) * 25;
        const cy = height * 0.85;

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = ch.colors.primary;
        ctx.fill();
        ctx.strokeStyle = ch.colors.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '9px "Palatino Linotype", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2a1810';
        ctx.fillText(ch.name, cx, cy + 16);
    }
}

// ── Supernatural ────────────────────────────────────────────────

function renderDetailSupernatural(
    ctx: CanvasRenderingContext2D,
    effects: { id: string; name: { de: string } }[],
    width: number,
    height: number,
) {
    for (let i = 0; i < effects.length; i++) {
        const eff = effects[i];
        let glowColor = 'rgba(100, 60, 180, 0.12)';

        if (eff.id.includes('red') || eff.id.includes('veinlight')) {
            glowColor = 'rgba(180, 40, 30, 0.12)';
        } else if (eff.id.includes('blue') || eff.id.includes('healing')) {
            glowColor = 'rgba(50, 100, 200, 0.12)';
        } else if (eff.id.includes('oak') || eff.id.includes('gray')) {
            glowColor = 'rgba(160, 140, 50, 0.10)';
        }

        // Atmospheric overlay
        const grad = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) * 0.4,
        );
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
}

// ── Title ───────────────────────────────────────────────────────

function renderDetailTitle(
    ctx: CanvasRenderingContext2D,
    loc: StoryLocation,
    chapter: number,
    width: number,
) {
    const name = loc.name.de;
    const sub = loc.subtitle?.de ?? '';

    ctx.save();
    ctx.font = 'bold 20px "Palatino Linotype", serif';
    const nameW = ctx.measureText(name).width;
    const boxW = nameW + 30;
    const boxH = sub ? 50 : 36;
    const boxX = (width - boxW) / 2;
    const boxY = 8;

    // Cartouche
    ctx.fillStyle = 'rgba(248, 232, 196, 0.95)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#2a1810';
    ctx.fillText(name, width / 2, boxY + 7);

    if (sub) {
        ctx.font = 'italic 12px "Palatino Linotype", serif';
        ctx.fillStyle = '#6a4a2a';
        ctx.fillText(sub, width / 2, boxY + 30);
    }

    ctx.restore();
}
