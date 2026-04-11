/**
 * Lore overlay rendering for the world map.
 *
 * When the user has imported a lore file (via the Lore panel in the
 * sidebar), the worldmap gets extra decorative overlays:
 *
 *   - renderLoreRegions       Dashed region boundaries + region
 *                             names, floating above the terrain.
 *   - renderLoreRiverLabels   Replaces the auto-generated river
 *                             names with the user-defined lore names
 *                             where available.
 *   - renderLoreLandmarks     Draws labels for lore-defined
 *                             landmarks (mountains, lakes, ruins,
 *                             caves...) with type-specific emoji
 *                             hints.
 *
 * These are pure canvas overlays. They don't touch the heightmap
 * or the procedural-feature layers - they read from the lore
 * configuration object and draw text + a few primitive shapes.
 */

import { PALETTES } from '../../../utils';

/** Subset of the world map config that the lore renderers need. */
export interface LoreRenderConfig {
    width: number;
    height: number;
    mapStyle: string;
}

/** Shape of a single lore region as consumed by the renderer. */
export interface LoreRegion {
    name: string;
    relX: number;
    relY: number;
    relRadius: number;
}

/** Lore river with optional name override. */
export interface LoreRiver {
    name?: string;
}

/** A single generated river polyline (source -> mouth). */
export type RiverPolyline = Array<{ x: number; y: number }>;

/** Lore landmark (mountains, lakes, caves, ruins, ...). */
export interface LoreLandmark {
    name: string;
    type: string;
    relX: number | null;
    relY: number | null;
}

/**
 * Render dashed circles and italic names for each lore-defined
 * region. The circle sits at (region.relX * width, region.relY * height)
 * with radius = relRadius * min(width, height). The name label
 * floats at the top of the circle so it stays readable over busy
 * terrain.
 */
export function renderLoreRegions(
    ctx: CanvasRenderingContext2D,
    cfg: LoreRenderConfig,
    regions: readonly LoreRegion[],
): void {
    ctx.save();
    for (const region of regions) {
        const rx = region.relX * cfg.width;
        const ry = region.relY * cfg.height;
        const rRadius = region.relRadius * Math.min(cfg.width, cfg.height);

        // Subtle dashed boundary
        ctx.strokeStyle = 'rgba(42, 26, 10, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Italic region name floating above the circle
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

/**
 * Replace auto-generated river names with lore river names where
 * possible. Matches by position in the list (the first lore river
 * gets the first generated river, etc.). Rivers shorter than 10
 * points are skipped because their path is too short to carry a
 * readable label.
 */
export function renderLoreRiverLabels(
    ctx: CanvasRenderingContext2D,
    cfg: LoreRenderConfig,
    generatedRivers: readonly RiverPolyline[],
    loreRivers: readonly LoreRiver[],
): void {
    const isParchment = cfg.mapStyle === 'parchment';

    const pairCount = Math.min(generatedRivers.length, loreRivers.length);
    for (let i = 0; i < pairCount; i++) {
        const river = generatedRivers[i];
        const loreRiver = loreRivers[i];
        if (river.length < 10 || !loreRiver.name) continue;

        const midIdx = Math.floor(river.length * 0.4);
        const pt = river[midIdx];

        ctx.save();
        ctx.font = 'italic 10px "Palatino Linotype", serif';
        ctx.fillStyle = isParchment ? PALETTES.parchment.water : '#2a5a8a';
        ctx.textAlign = 'center';

        // Rotate the label to follow the river's local flow direction
        const nextPt = river[Math.min(midIdx + 3, river.length - 1)];
        const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
        ctx.translate(pt.x, pt.y);
        ctx.rotate(angle);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeText(loreRiver.name, 0, -6);
        ctx.fillText(loreRiver.name, 0, -6);
        ctx.restore();
    }
}

/**
 * Draw labels for each lore landmark with a type-specific emoji
 * prefix so it reads at a glance whether a label points to a
 * mountain, a ruin, a cave, etc.
 */
export function renderLoreLandmarks(
    ctx: CanvasRenderingContext2D,
    cfg: LoreRenderConfig,
    landmarks: readonly LoreLandmark[],
    _heightMap: Float32Array,
): void {
    ctx.save();
    for (const lm of landmarks) {
        if (lm.relX === null || lm.relY === null) continue;

        const lx = lm.relX * cfg.width;
        const ly = lm.relY * cfg.height;

        ctx.font = 'bold 10px "Palatino Linotype", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 3;

        let label = lm.name;
        let yOffset = 0;
        switch (lm.type) {
            case 'mountain': label = '⛰ ' + lm.name; yOffset = -8; break;
            case 'volcano':  label = '🌋 ' + lm.name; yOffset = -8; break;
            case 'forest':   label = '🌲 ' + lm.name; yOffset = 4;  break;
            case 'lake':     label = '💧 ' + lm.name; yOffset = 4;  break;
            case 'ruins':    label = '🏚 ' + lm.name; yOffset = 4;  break;
            case 'cave':     label = '⬛ ' + lm.name; yOffset = 4;  break;
            // Unknown types get no prefix
        }

        ctx.strokeText(label, lx, ly + yOffset);
        ctx.fillStyle = '#2a1a0a';
        ctx.fillText(label, lx, ly + yOffset);
    }
    ctx.restore();
}
