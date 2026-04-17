/**
 * Loads the Calyndra world data from the JSON files in examples/calyndra/.
 *
 * All 5 files are imported statically (Vite handles JSON imports).
 * At load time we build lookup maps and compute the chapter range
 * so the renderer doesn't have to do this on every frame.
 */

import type {
    StoryWorldData,
    StoryLocation,
    WorldRegionsFile,
    LocationsFile,
    CharactersFile,
    WorldFeaturesFile,
    PathsFile,
} from './types';

// Static JSON imports — Vite resolves these at build time
import regionsJson from '../../../../examples/calyndra/world-regions.json';
import locationsJson from '../../../../examples/calyndra/locations.json';
import charactersJson from '../../../../examples/calyndra/characters.json';
import featuresJson from '../../../../examples/calyndra/world-features.json';
import pathsJson from '../../../../examples/calyndra/paths.json';

/**
 * Load, parse, and index all story world data.
 * Synchronous — the JSON is already bundled by Vite.
 */
export function loadWorldData(): StoryWorldData {
    const regions = regionsJson as WorldRegionsFile;
    const locations = locationsJson as LocationsFile;
    const characters = charactersJson as CharactersFile;
    const features = featuresJson as WorldFeaturesFile;
    const paths = pathsJson as PathsFile;

    // Build location lookup map
    const locationById = new Map<string, StoryLocation>();
    for (const loc of locations.locations) {
        locationById.set(loc.id, loc as StoryLocation);
    }

    // Compute max chapter from all data sources
    let maxChapter = 0;
    for (const loc of locations.locations) {
        for (const b of loc.buildings) {
            if (b.minChapter > maxChapter) maxChapter = b.minChapter;
            if (b.destroyedChapter != null && b.destroyedChapter > maxChapter) {
                maxChapter = b.destroyedChapter;
            }
        }
    }
    for (const ch of characters.characters) {
        for (const cl of ch.locations) {
            for (const c of cl.chapters) {
                if (c > maxChapter) maxChapter = c;
            }
        }
    }
    for (const se of features.supernaturalElements) {
        if (se.minChapter > maxChapter) maxChapter = se.minChapter;
    }

    return {
        meta: regions.meta,
        regions: regions.regions,
        locations: locations.locations as StoryLocation[],
        characters: characters.characters,
        featureRegions: features.regions,
        rivers: features.rivers,
        hills: features.hills,
        supernaturalElements: features.supernaturalElements,
        destructionEvents: features.destructionEvents,
        worldPaths: paths.worldPaths,
        localPaths: paths.localPaths,
        locationById,
        maxChapter,
    };
}

// ── World bounds ────────────────────────────────────────────────

/**
 * Compute the bounding rectangle of ALL locations in world coords.
 * Adds padding so there's room to breathe at the edges and so
 * future locations can be added slightly beyond the current extent
 * without a jarring viewport jump.
 *
 * Returns { x, y, w, h } in the original world coordinate space
 * (not pixels).
 */
export function computeWorldBounds(
    data: StoryWorldData,
    padding = 0.25,
): { x: number; y: number; w: number; h: number } {
    if (data.locations.length === 0) {
        return { x: 0, y: 0, w: 1000, h: 650 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const loc of data.locations) {
        minX = Math.min(minX, loc.coordinates.x);
        minY = Math.min(minY, loc.coordinates.y);
        maxX = Math.max(maxX, loc.coordinates.x);
        maxY = Math.max(maxY, loc.coordinates.y);
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const pad = Math.max(w, h) * padding;

    return {
        x: minX - pad,
        y: minY - pad,
        w: w + pad * 2,
        h: h + pad * 2,
    };
}

// ── Query helpers ───────────────────────────────────────────────

/** Locations visible at the given chapter (at least one building revealed). */
export function getVisibleLocations(data: StoryWorldData, chapter: number): StoryLocation[] {
    return data.locations.filter(loc =>
        loc.buildings.some(b => b.minChapter <= chapter),
    );
}

/** Buildings visible at the given chapter for a specific location. */
export function getVisibleBuildings(data: StoryWorldData, locationId: string, chapter: number) {
    const loc = data.locationById.get(locationId);
    if (!loc) return [];
    return loc.buildings.filter(b => b.minChapter <= chapter);
}

/** Whether a building is destroyed at the given chapter. */
export function isBuildingDestroyed(b: { destroyedChapter?: number }, chapter: number): boolean {
    return b.destroyedChapter != null && b.destroyedChapter <= chapter;
}

/** Whether a location is destroyed at the given chapter. */
export function isLocationDestroyed(loc: StoryLocation, chapter: number): boolean {
    return loc.destroyedMinChapter != null && loc.destroyedMinChapter <= chapter;
}

/** Characters present at a location in the given chapter. */
export function getCharactersAtLocation(
    data: StoryWorldData,
    locationId: string,
    chapter: number,
) {
    return data.characters.filter(ch =>
        ch.locations.some(cl =>
            cl.locationId === locationId && cl.chapters.includes(chapter),
        ),
    );
}

/** Supernatural elements active at a location in the given chapter. */
export function getSupernaturalAtLocation(
    data: StoryWorldData,
    locationId: string,
    chapter: number,
) {
    return data.supernaturalElements.filter(se =>
        se.locationId === locationId && se.minChapter <= chapter,
    );
}

/** Get the subtitle for a location at the given chapter. */
export function getLocationSubtitle(loc: StoryLocation, chapter: number): string | null {
    if (!loc.subtitles || loc.subtitles.length === 0) return null;
    // Subtitles are ordered highest-minChapter first; pick the first match
    for (const sub of loc.subtitles) {
        if (chapter >= sub.minChapter) return sub.key;
    }
    return null;
}
