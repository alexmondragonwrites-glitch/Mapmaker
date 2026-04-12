/**
 * World overview renderer for the Story Map.
 *
 * Draws the full Calyndra world on canvas:
 * - Terrain base with region-appropriate coloring
 * - Fog of war for unrevealed areas
 * - Routes between locations (SVG bezier paths)
 * - Location nodes (clickable)
 * - Character markers
 * - Supernatural indicators
 * - Labels
 */

import { SimplexNoise } from '../../noise';
import { parseSVGPath, scalePoints, scaleCoord, drawPointPath } from './svg-path';
import {
    getVisibleLocations,
    isLocationDestroyed,
    getCharactersAtLocation,
    getSupernaturalAtLocation,
} from './data-loader';
import type { StoryWorldData, StoryLocation, Point } from './types';

// The JSON viewBox dimensions
const VIEW_W = 1000;
const VIEW_H = 650;

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

    // 1. Terrain base
    renderTerrain(ctx, data, width, height);

    // 2. Region boundaries & fills
    renderRegions(ctx, data, width, height);

    // 3. Fog of war (darken unrevealed areas)
    renderFogOfWar(ctx, data, chapter, width, height);

    // 4. Paths/routes (only between visible locations)
    if (showPaths) {
        renderWorldPaths(ctx, data, chapter, width, height);
    }

    // 5. Location nodes
    const visibleLocations = getVisibleLocations(data, chapter);
    renderLocationNodes(ctx, data, visibleLocations, chapter, width, height, showLabels);

    // 6. Character markers
    if (showCharacters) {
        renderCharacterMarkers(ctx, data, visibleLocations, chapter, width, height);
    }

    // 7. Supernatural indicators
    if (showSupernatural) {
        renderSupernaturalIndicators(ctx, data, visibleLocations, chapter, width, height);
    }

    // 8. Map title
    renderTitle(ctx, data, chapter, width);

    // 9. Register clickable areas for zoom-in
    if (zoomController) {
        registerClickableAreas(zoomController, visibleLocations, width, height);
    }
}

// ── Terrain ─────────────────────────────────────────────────────

function renderTerrain(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    width: number,
    height: number,
) {
    // Dark base — the story map has a dark/mysterious aesthetic
    ctx.fillStyle = '#0c1208';
    ctx.fillRect(0, 0, width, height);

    // Noise-based terrain texture
    const noise = new SimplexNoise(42);
    for (let y = 0; y < height; y += 3) {
        for (let x = 0; x < width; x += 3) {
            const n = noise.fbm(x / 200, y / 200, 3);
            const brightness = 12 + n * 8;
            const g = brightness * 1.3;
            const r = brightness * 0.9;
            const b = brightness * 0.7;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 3, 3);
        }
    }
}

// ── Regions ─────────────────────────────────────────────────────

function renderRegions(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    width: number,
    height: number,
) {
    for (const region of data.featureRegions) {
        if (!region.svgPath) continue;

        const points = parseSVGPath(region.svgPath);
        const scaled = scalePoints(points, VIEW_W, VIEW_H, width, height);

        // Fill color based on region type
        let fillColor: string;
        switch (region.type) {
            case 'forest':
                fillColor = 'rgba(17, 34, 9, 0.6)';
                break;
            case 'darkwood':
                fillColor = 'rgba(5, 9, 16, 0.8)';
                break;
            default:
                fillColor = 'rgba(20, 30, 15, 0.3)';
        }

        ctx.save();
        drawPointPath(ctx, scaled, true);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();
    }

    // Fog effect for mist regions
    for (const region of data.featureRegions) {
        if (!region.fogEffect) continue;
        const { cx, cy, rx, ry } = region.fogEffect;
        const p = scaleCoord(cx, cy, VIEW_W, VIEW_H, width, height);
        const sRx = (rx / VIEW_W) * width;
        const sRy = (ry / VIEW_H) * height;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(sRx, sRy));
        gradient.addColorStop(0, 'rgba(120, 130, 140, 0.15)');
        gradient.addColorStop(0.6, 'rgba(100, 110, 120, 0.08)');
        gradient.addColorStop(1, 'rgba(80, 90, 100, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, sRx, sRy, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Hills
    for (const hill of data.hills) {
        for (const shape of hill.shapes) {
            const p = scaleCoord(shape.cx, shape.cy, VIEW_W, VIEW_H, width, height);
            const rx = (shape.rx / VIEW_W) * width;
            const ry = (shape.ry / VIEW_H) * height;

            ctx.fillStyle = `rgba(60, 80, 40, ${shape.opacity * 0.3})`;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ── Fog of War ──────────────────────────────────────────────────

function renderFogOfWar(
    ctx: CanvasRenderingContext2D,
    data: StoryWorldData,
    chapter: number,
    width: number,
    height: number,
) {
    const noise = new SimplexNoise(123);
    const visibleIds = new Set(
        getVisibleLocations(data, chapter).map(l => l.id),
    );

    // Darken areas around unrevealed locations
    for (const loc of data.locations) {
        if (visibleIds.has(loc.id)) continue;

        const p = scaleCoord(
            loc.coordinates.x, loc.coordinates.y,
            VIEW_W, VIEW_H, width, height,
        );

        // Dark fog circle with noisy edges
        const radius = 60 + noise.noise2D(p.x / 100, p.y / 100) * 20;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, 'rgba(5, 5, 8, 0.9)');
        gradient.addColorStop(0.7, 'rgba(5, 5, 8, 0.5)');
        gradient.addColorStop(1, 'rgba(5, 5, 8, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
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
        // Only show paths where both endpoints are revealed
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

        // Node glow
        const glowColor = destroyed ? 'rgba(200, 60, 40, 0.3)' : 'rgba(196, 135, 58, 0.3)';
        const glowRadius = loc.type === 'village' ? 20 : 14;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Node dot
        const nodeRadius = loc.type === 'village' ? 6 : 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = destroyed ? '#c83828' : '#c4873a';
        ctx.fill();
        ctx.strokeStyle = destroyed ? '#801810' : '#8a5a1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(p.x, p.y - 1, nodeRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = destroyed ? 'rgba(255, 120, 80, 0.5)' : 'rgba(255, 220, 150, 0.5)';
        ctx.fill();

        // Label
        if (showLabels) {
            ctx.save();
            ctx.font = loc.type === 'village' ? 'bold 11px "Palatino Linotype", serif'
                : '10px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // Shadow for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText(loc.name.de, p.x + 1, p.y + nodeRadius + 5);
            ctx.fillStyle = destroyed ? '#c87868' : '#e8dcc8';
            ctx.fillText(loc.name.de, p.x, p.y + nodeRadius + 4);
            ctx.restore();
        }
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

        // Fan characters around the location node
        const spread = 12;
        const startAngle = -Math.PI / 2 - ((chars.length - 1) * 0.3) / 2;

        for (let i = 0; i < chars.length; i++) {
            const angle = startAngle + i * 0.3;
            const cx = base.x + Math.cos(angle) * spread;
            const cy = base.y + Math.sin(angle) * spread;

            // Character dot with their color
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

        // Pulsing glow around locations with supernatural activity
        const pulseRadius = 25 + effects.length * 5;

        // Determine color based on effect types
        let glowR = 100, glowG = 60, glowB = 180; // default: purple
        for (const eff of effects) {
            if (eff.id.includes('red') || eff.id.includes('veinlight') || eff.id.includes('stillbrand')) {
                glowR = 180; glowG = 40; glowB = 40; // red
            } else if (eff.id.includes('blue') || eff.id.includes('healing')) {
                glowR = 60; glowG = 120; glowB = 220; // blue
            } else if (eff.id.includes('oak') || eff.id.includes('gray')) {
                glowR = 160; glowG = 140; glowB = 60; // golden
            }
        }

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseRadius);
        gradient.addColorStop(0, `rgba(${glowR}, ${glowG}, ${glowB}, 0.15)`);
        gradient.addColorStop(0.5, `rgba(${glowR}, ${glowG}, ${glowB}, 0.05)`);
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

    // Title bar background
    ctx.fillStyle = 'rgba(10, 8, 6, 0.8)';
    ctx.fillRect(0, 0, width, 44);
    ctx.strokeStyle = 'rgba(196, 135, 58, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.lineTo(width, 44);
    ctx.stroke();

    // Title text
    ctx.font = 'small-caps bold 16px "Palatino Linotype", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c4873a';
    ctx.fillText(title, width / 2, 18);

    // Chapter indicator
    ctx.font = '11px "Palatino Linotype", serif';
    ctx.fillStyle = '#9a8a6a';
    ctx.fillText(chapterLabel, width / 2, 34);
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

        const clickRadius = loc.type === 'village' ? 20 : 14;

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
                seed: 42,       // story maps use a fixed seed
                size: loc.type === 'village' ? 'medium' : 'small',
                style: 'human',
            },
        });
    }
}
