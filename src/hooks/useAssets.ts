import { useState, useCallback, useEffect, useRef } from 'react';
import { getAssetStore, type PackRecord } from '../engine/assets-runtime';
import { importDrop, type ImportResult } from '../engine/assets-runtime/importer';

export interface AssetSummary {
    totalPacks: number;
    enabledPacks: number;
    totalAssets: number;
    perCategory: Record<string, number>;
}

export function useAssets() {
    const storeRef = useRef(getAssetStore());
    const [packs, setPacks] = useState<PackRecord[]>([]);
    const [summary, setSummary] = useState<AssetSummary>({
        totalPacks: 0,
        enabledPacks: 0,
        totalAssets: 0,
        perCategory: {},
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastImport, setLastImport] = useState<ImportResult | null>(null);

    /** Reload packs from IndexedDB and rebuild cache. */
    const refresh = useCallback(async () => {
        const store = storeRef.current;
        try {
            await store.open();
            const list = await store.listPacks();
            setPacks(list);
            await store.buildCache();
            setSummary({
                totalPacks: list.length,
                enabledPacks: list.filter(p => p.enabled).length,
                totalAssets: store.totalCached(),
                perCategory: store.cachedByCategory(),
            });
            setError(null);
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        refresh();
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
    };
}
