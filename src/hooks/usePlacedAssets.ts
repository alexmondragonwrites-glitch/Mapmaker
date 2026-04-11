/**
 * Manually-placed assets state + persistence.
 *
 * The user can drop individual assets onto the map with the place
 * tool. Those placements are stored per (generatorId, seed) pair so
 * switching to a different seed swaps to a different set of
 * placements and each map gets its own persistent overlay.
 *
 * Coordinates are stored as normalized values in [0,1] so the same
 * placements render correctly at any canvas resolution.
 *
 * Persistence: localStorage under `calyndra-placed-assets`. Plain
 * JSON so the map save/load feature (F1d) can embed it directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetCategory } from '../engine/assets-runtime';

const STORAGE_KEY = 'calyndra-placed-assets';

/** A single placed asset on some map. */
export interface PlacedAsset {
    /** Stable UUID-ish id for removal. */
    id: string;
    /** Which generator this placement belongs to (worldmap/citymap/...). */
    generatorId: string;
    /** Seed of the map at placement time - ties the overlay to that specific map. */
    mapSeed: number;
    /** Asset category (used for scaling and the picker fallback). */
    category: AssetCategory;
    /** Optional specific variant id; if unset, the picker picks by seed at render time. */
    variantId?: string;
    /** Normalized x in [0,1] (fraction of canvas width). */
    nx: number;
    /** Normalized y in [0,1] (fraction of canvas height). */
    ny: number;
    /** Base size in pixels (fed into the procedural draw signature). */
    size: number;
}

/** Shape of the persisted blob. */
interface StoredData {
    version: 1;
    placements: PlacedAsset[];
}

/** Load from localStorage; return empty if missing or malformed. */
function loadFromStorage(): PlacedAsset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as StoredData;
        if (parsed?.version !== 1 || !Array.isArray(parsed.placements)) return [];
        return parsed.placements;
    } catch {
        return [];
    }
}

/** Write to localStorage, swallowing quota / serialization errors. */
function saveToStorage(placements: PlacedAsset[]): void {
    try {
        const data: StoredData = { version: 1, placements };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
        console.warn('[usePlacedAssets] save failed:', err);
    }
}

/** Generate a short-ish unique id for a new placement. */
function newId(): string {
    return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function usePlacedAssets() {
    const [placements, setPlacements] = useState<PlacedAsset[]>(() => loadFromStorage());

    // Persist on every change. Debounce would be nicer for bulk drags
    // but individual placements are infrequent so this is fine.
    const initialMount = useRef(true);
    useEffect(() => {
        // Skip the initial load - we just read from storage
        if (initialMount.current) {
            initialMount.current = false;
            return;
        }
        saveToStorage(placements);
    }, [placements]);

    /** Add a new placement and return its id. */
    const add = useCallback((p: Omit<PlacedAsset, 'id'>): string => {
        const id = newId();
        setPlacements(prev => [...prev, { ...p, id }]);
        return id;
    }, []);

    /** Remove a placement by id. */
    const remove = useCallback((id: string): void => {
        setPlacements(prev => prev.filter(p => p.id !== id));
    }, []);

    /** Remove every placement for one (generator, seed) map. */
    const clearForMap = useCallback((generatorId: string, mapSeed: number): void => {
        setPlacements(prev => prev.filter(
            p => !(p.generatorId === generatorId && p.mapSeed === mapSeed),
        ));
    }, []);

    /** Remove everything across all maps. */
    const clearAll = useCallback((): void => {
        setPlacements([]);
    }, []);

    /** Return the subset that belongs to the given (generator, seed) pair. */
    const forMap = useCallback((
        generatorId: string,
        mapSeed: number,
    ): PlacedAsset[] => {
        return placements.filter(
            p => p.generatorId === generatorId && p.mapSeed === mapSeed,
        );
    }, [placements]);

    /**
     * Replace the entire placement set (used by the map load feature
     * and by `clearForMap` followed by `addMany`).
     */
    const replaceAll = useCallback((list: PlacedAsset[]): void => {
        setPlacements(list);
    }, []);

    return {
        placements,
        add,
        remove,
        clearForMap,
        clearAll,
        forMap,
        replaceAll,
    };
}
