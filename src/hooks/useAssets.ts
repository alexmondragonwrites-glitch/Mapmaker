import { useState, useCallback, useEffect, useRef } from 'react';
import { getAssetStore, type PackRecord, type AssetCategory } from '../engine/assets-runtime';
import { importDrop, type ImportResult } from '../engine/assets-runtime/importer';
import { autoLoadDevAssets } from '../engine/assets-runtime/devAutoLoader';
import { invalidateBridgeCache } from '../engine/assets-runtime/bridge';

/** One row in the "full variant list" view used by AssetPanel. */
export interface AssetVariantRow {
    id: string;
    packId: string;
    filename: string;
    width?: number;
    height?: number;
    disabled: boolean;
}

export interface AssetDiagSample {
    filename: string;
    width?: number;
    height?: number;
}

export interface AssetDiagCategory {
    count: number;
    samples: AssetDiagSample[];
}

export interface AssetSummary {
    totalPacks: number;
    enabledPacks: number;
    totalAssets: number;
    perCategory: Record<string, number>;
    diagnostics: Record<string, AssetDiagCategory>;
}

export function useAssets() {
    const storeRef = useRef(getAssetStore());
    const [packs, setPacks] = useState<PackRecord[]>([]);
    const [summary, setSummary] = useState<AssetSummary>({
        totalPacks: 0,
        enabledPacks: 0,
        totalAssets: 0,
        perCategory: {},
        diagnostics: {},
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastImport, setLastImport] = useState<ImportResult | null>(null);

    // Tracks whether the hook is still mounted so async work spawned
    // in useEffect or async actions doesn't setState after unmount.
    // React StrictMode double-invokes effects which means the first
    // instance gets cancelled mid-flight - this flag prevents the
    // resulting "setState on unmounted component" warning and the
    // subtle state desync that could follow.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /** Reload packs from IndexedDB and rebuild cache. */
    const refresh = useCallback(async () => {
        const store = storeRef.current;
        try {
            await store.open();
            const list = await store.listPacks();
            if (!mountedRef.current) return;
            setPacks(list);
            await store.buildCache();
            // Packs or enablement may have changed - drop the bridge's
            // per-category availability cache so hot-path tryDrawAsset
            // picks up new assets on the next render.
            invalidateBridgeCache();
            if (!mountedRef.current) return;
            setSummary({
                totalPacks: list.length,
                enabledPacks: list.filter(p => p.enabled).length,
                totalAssets: store.totalCached(),
                perCategory: store.cachedByCategory(),
                diagnostics: store.diagnosticsByCategory(5),
            });
            setError(null);
        } catch (err: any) {
            if (!mountedRef.current) return;
            setError(err.message || String(err));
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // Initial load: auto-import any local dev assets, then refresh
    useEffect(() => {
        (async () => {
            try {
                await storeRef.current.open();
                // Dev mode only: pull PNGs from the on-disk private-assets/ folder
                const devCount = await autoLoadDevAssets(storeRef.current);
                if (devCount > 0) {
                    console.info(`[useAssets] auto-loaded ${devCount} dev assets from private-assets/`);
                }
            } catch (err) {
                console.warn('[useAssets] dev auto-load failed:', err);
            }
            if (mountedRef.current) await refresh();
        })();
    }, [refresh]);

    const importFiles = useCallback(async (files: File[]) => {
        setLoading(true);
        setError(null);
        try {
            const result = await importDrop(storeRef.current, files);
            setLastImport(result);
            await refresh();
            return result;
        } catch (err: any) {
            setError(err.message || String(err));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    const togglePack = useCallback(async (id: string, enabled: boolean) => {
        setLoading(true);
        try {
            await storeRef.current.setPackEnabled(id, enabled);
            await refresh();
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    const deletePack = useCallback(async (id: string) => {
        setLoading(true);
        try {
            await storeRef.current.deletePack(id);
            await refresh();
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    /**
     * Return the full variant list for a category (async so the UI
     * can lazy-load it when the user expands a category row). Does
     * not touch React state - the caller stores the rows locally.
     */
    const listVariants = useCallback(async (
        category: AssetCategory,
    ): Promise<AssetVariantRow[]> => {
        await storeRef.current.open();
        return storeRef.current.listAllAssets(category);
    }, []);

    /**
     * Flip one asset's disabled flag and rebuild the cache so the
     * next generate() uses the updated set. Kept on the hook so
     * components don't have to reach for the raw store.
     */
    const toggleAsset = useCallback(async (
        id: string,
        disabled: boolean,
    ): Promise<void> => {
        setLoading(true);
        try {
            await storeRef.current.setAssetDisabled(id, disabled);
            await refresh();
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    return {
        packs,
        summary,
        loading,
        error,
        lastImport,
        refresh,
        importFiles,
        togglePack,
        deletePack,
        listVariants,
        toggleAsset,
    };
}
