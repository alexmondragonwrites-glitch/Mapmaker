/**
 * Story editor hook — manages editable world data with CRUD
 * operations and localStorage persistence.
 *
 * The editor works on a COPY of the loaded story data. Changes are
 * saved to localStorage and can be exported/imported as JSON.
 * The original JSON files in examples/calyndra/ are never modified
 * at runtime.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
    StoryWorldData,
    StoryLocation,
    StoryBuilding,
    WorldPath,
    BiText,
    LocationType,
} from '../engine/generators/storymap/types';
import { loadWorldData } from '../engine/generators/storymap/data-loader';
import { setStoryMapData } from '../engine/generators/storymap/storymap-generator';

const STORAGE_KEY = 'calyndra-story-editor';
const PASSWORD_HASH_KEY = 'calyndra-admin-hash';

// ── Password hashing ────────────────────────────────────────────

async function hashPassword(pw: string): Promise<string> {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Hook ────────────────────────────────────────────────────────

export function useStoryEditor() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPassword, setHasPassword] = useState(false);
    const [worldData, setWorldData] = useState<StoryWorldData | null>(null);
    const [dirty, setDirty] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Check if a password has been set
    useEffect(() => {
        setHasPassword(!!localStorage.getItem(PASSWORD_HASH_KEY));
    }, []);

    // Load data: prefer localStorage overlay, fall back to bundled JSON
    useEffect(() => {
        const base = loadWorldData();
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const overlay = JSON.parse(saved) as {
                    locations?: StoryLocation[];
                    worldPaths?: WorldPath[];
                };
                // Merge saved locations/paths over the base
                if (overlay.locations) {
                    const savedIds = new Set(overlay.locations.map(l => l.id));
                    const merged = [
                        ...base.locations.filter(l => !savedIds.has(l.id)),
                        ...overlay.locations,
                    ];
                    base.locations = merged as StoryLocation[];
                    // Rebuild lookup
                    base.locationById = new Map();
                    for (const loc of base.locations) {
                        base.locationById.set(loc.id, loc);
                    }
                }
                if (overlay.worldPaths) {
                    const savedPathIds = new Set(overlay.worldPaths.map(p => p.id));
                    base.worldPaths = [
                        ...base.worldPaths.filter(p => !savedPathIds.has(p.id)),
                        ...overlay.worldPaths,
                    ];
                }
                // Recompute maxChapter
                let max = 0;
                for (const loc of base.locations) {
                    for (const b of loc.buildings) {
                        if (b.minChapter > max) max = b.minChapter;
                    }
                }
                base.maxChapter = max;
            } catch (e) {
                console.warn('[useStoryEditor] Failed to load saved data:', e);
            }
        }
        setWorldData(base);
        setStoryMapData(base);
    }, []);

    // Auto-save to localStorage when dirty
    useEffect(() => {
        if (!dirty || !worldData) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const overlay = {
                locations: worldData.locations,
                worldPaths: worldData.worldPaths,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
            setDirty(false);
        }, 500);
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [dirty, worldData]);

    // Push changes to the storymap generator
    const commitChanges = useCallback((updated: StoryWorldData) => {
        setWorldData(updated);
        setStoryMapData(updated);
        setDirty(true);
    }, []);

    // ── Auth ────────────────────────────────────────────────────

    const setPassword = useCallback(async (pw: string) => {
        const hash = await hashPassword(pw);
        localStorage.setItem(PASSWORD_HASH_KEY, hash);
        setHasPassword(true);
        setIsAuthenticated(true);
    }, []);

    const login = useCallback(async (pw: string): Promise<boolean> => {
        const stored = localStorage.getItem(PASSWORD_HASH_KEY);
        if (!stored) return false;
        const hash = await hashPassword(pw);
        if (hash === stored) {
            setIsAuthenticated(true);
            return true;
        }
        return false;
    }, []);

    const logout = useCallback(() => {
        setIsAuthenticated(false);
    }, []);

    // ── Location CRUD ───────────────────────────────────────────

    const addLocation = useCallback((loc: StoryLocation) => {
        if (!worldData) return;
        const updated = { ...worldData };
        updated.locations = [...updated.locations, loc];
        updated.locationById = new Map(updated.locationById);
        updated.locationById.set(loc.id, loc);
        commitChanges(updated);
    }, [worldData, commitChanges]);

    const updateLocation = useCallback((id: string, changes: Partial<StoryLocation>) => {
        if (!worldData) return;
        const updated = { ...worldData };
        updated.locations = updated.locations.map(l =>
            l.id === id ? { ...l, ...changes } as StoryLocation : l,
        );
        updated.locationById = new Map();
        for (const loc of updated.locations) {
            updated.locationById.set(loc.id, loc);
        }
        commitChanges(updated);
    }, [worldData, commitChanges]);

    const deleteLocation = useCallback((id: string) => {
        if (!worldData) return;
        const updated = { ...worldData };
        updated.locations = updated.locations.filter(l => l.id !== id);
        updated.locationById = new Map();
        for (const loc of updated.locations) {
            updated.locationById.set(loc.id, loc);
        }
        updated.worldPaths = updated.worldPaths.filter(
            p => p.from !== id && p.to !== id,
        );
        commitChanges(updated);
    }, [worldData, commitChanges]);

    // ── Path CRUD ───────────────────────────────────────────────

    const addPath = useCallback((path: WorldPath) => {
        if (!worldData) return;
        const updated = { ...worldData };
        updated.worldPaths = [...updated.worldPaths, path];
        commitChanges(updated);
    }, [worldData, commitChanges]);

    const deletePath = useCallback((id: string) => {
        if (!worldData) return;
        const updated = { ...worldData };
        updated.worldPaths = updated.worldPaths.filter(p => p.id !== id);
        commitChanges(updated);
    }, [worldData, commitChanges]);

    // ── Export / Import ─────────────────────────────────────────

    const exportData = useCallback(() => {
        if (!worldData) return;
        const payload = {
            locations: worldData.locations,
            worldPaths: worldData.worldPaths,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calyndra-world-export.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [worldData]);

    const importData = useCallback(async (file: File) => {
        if (!worldData) return;
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.locations) {
            const updated = { ...worldData };
            updated.locations = parsed.locations;
            updated.locationById = new Map();
            for (const loc of updated.locations) {
                updated.locationById.set(loc.id, loc);
            }
            if (parsed.worldPaths) {
                updated.worldPaths = parsed.worldPaths;
            }
            commitChanges(updated);
        }
    }, [worldData, commitChanges]);

    const resetToDefaults = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        const base = loadWorldData();
        setWorldData(base);
        setStoryMapData(base);
        setDirty(false);
    }, []);

    return {
        // Auth
        isAuthenticated,
        hasPassword,
        setPassword,
        login,
        logout,
        // Data
        worldData,
        dirty,
        // Locations
        addLocation,
        updateLocation,
        deleteLocation,
        // Paths
        addPath,
        deletePath,
        // IO
        exportData,
        importData,
        resetToDefaults,
    };
}
