/**
 * Renders the user-placed asset overlay on top of a generated map.
 *
 * This runs after the procedural generator finishes so placements
 * always sit on top of the base terrain/buildings/districts. Each
 * placement's normalized (nx, ny) coordinate is converted to canvas
 * pixels using the live width/height, so placements stay pinned to
 * the right spot across resolution changes.
 *
 * The render goes through either:
 *   - `drawAssetById` for placements with a pinned variant id, or
 *   - `tryDrawAsset` for placements that want a deterministic
 *     random variant (seed derived from the placement id + position).
 *
 * There's no procedural fallback - if a placed asset can't find any
 * PNG at all, we skip it silently. That matches the user's intent:
 * they asked for *that* asset, not a procedural proxy.
 */

import type { PlacedAsset } from '../hooks/usePlacedAssets';
import { drawAssetById, tryDrawAsset } from './assets-runtime/bridge';

/**
 * Draw every placed asset in `placements` onto the given canvas.
 * Coordinates come from (nx, ny) * (canvas.width, canvas.height).
 */
export function renderPlacedAssets(
    canvas: HTMLCanvasElement,
    placements: readonly PlacedAsset[],
): void {
    if (placements.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (const p of placements) {
        const x = p.nx * canvas.width;
        const y = p.ny * canvas.height;

        // Derive a stable seed from the placement id so random
        // variants stay the same across re-renders.
        const fallbackSeed = hashId(p.id);

        if (p.variantId) {
            drawAssetById(ctx, p.variantId, p.category, x, y, p.size, fallbackSeed);
        } else {
            tryDrawAsset(ctx, p.category, x, y, p.size, fallbackSeed);
        }
    }
}

/** Hash a string id to a 32-bit signed integer for seeded picking. */
function hashId(id: string): number {
    let h = 2166136261 | 0;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h | 0;
}
