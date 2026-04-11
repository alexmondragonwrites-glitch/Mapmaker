/**
 * IndexedDB wrapper for persistent asset storage.
 *
 * - Assets are stored as Blob with an ID of "<packId>/<filename>"
 * - Packs are stored in a separate object store with metadata
 * - On load, assets are decoded to HTMLImageElement and cached in memory
 *   per category so the generators can pick variants quickly
 *
 * Nothing here touches React. This is a plain class with async methods
 * that the hook layer (useAssets) will wrap.
 */

import type { AssetCategory, AssetRecord, PackRecord, LoadedAsset } from './types';
import { classifyFilename } from './classifier';

const DB_NAME = 'calyndra-assets';
const DB_VERSION = 1;
const STORE_ASSETS = 'assets';
const STORE_PACKS = 'packs';

export class AssetStore {
    private db: IDBDatabase | null = null;

    /** In-memory cache: category -> LoadedAsset[] (from enabled packs only) */
    private cache = new Map<AssetCategory, LoadedAsset[]>();
    /** Tracks which packs are currently in the cache, to invalidate correctly. */
    private cachedPackIds = new Set<string>();

    // ── Initialization ──────────────────────────────────────────────

    async open(): Promise<void> {
        if (this.db) return;

        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_ASSETS)) {
                    const store = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
                    store.createIndex('packId', 'packId', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_PACKS)) {
                    db.createObjectStore(STORE_PACKS, { keyPath: 'id' });
                }
            };
        });
    }

    private requireDb(): IDBDatabase {
        if (!this.db) throw new Error('AssetStore not opened (call open() first)');
        return this.db;
    }

    // ── Pack management ─────────────────────────────────────────────

    async listPacks(): Promise<PackRecord[]> {
        const db = this.requireDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_PACKS, 'readonly');
            const store = tx.objectStore(STORE_PACKS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result as PackRecord[]);
            req.onerror = () => reject(req.error);
        });
    }

    async getPack(id: string): Promise<PackRecord | null> {
        const db = this.requireDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_PACKS, 'readonly');
            const req = tx.objectStore(STORE_PACKS).get(id);
            req.onsuccess = () => resolve((req.result as PackRecord) ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async putPack(pack: PackRecord): Promise<void> {
        const db = this.requireDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_PACKS, 'readwrite');
            tx.objectStore(STORE_PACKS).put(pack);
            tx.oncomplete = () => {
                this.invalidateCache();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async setPackEnabled(id: string, enabled: boolean): Promise<void> {
        const pack = await this.getPack(id);
        if (!pack) return;
        pack.enabled = enabled;
        await this.putPack(pack);
    }

    async deletePack(id: string): Promise<void> {
        const db = this.requireDb();
        // Delete all assets with matching packId plus the pack itself
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_ASSETS, STORE_PACKS], 'readwrite');
            const assetStore = tx.objectStore(STORE_ASSETS);
            const packStore = tx.objectStore(STORE_PACKS);
            const index = assetStore.index('packId');
            const req = index.openCursor(IDBKeyRange.only(id));
            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    packStore.delete(id);
                }
            };
            tx.oncomplete = () => {
                this.invalidateCache();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    // ── Asset management ────────────────────────────────────────────

    /**
     * Add a blob as an asset to a pack, classifying it by filename.
     * Returns the AssetRecord, or null if classification failed and
     * the caller wants to handle unknown assets.
     */
    async addAsset(
        packId: string,
        filename: string,
        blob: Blob,
        overrideCategory?: AssetCategory,
    ): Promise<AssetRecord | null> {
        const db = this.requireDb();
        const category = overrideCategory ?? classifyFilename(filename);
        if (!category) {
            return null;
        }

        // Strip extension for the ID, prepend pack ID
        const safe = filename.replace(/[^a-z0-9_\-./]/gi, '_');
        const id = `${packId}/${safe}`;

        const record: AssetRecord = {
            id,
            packId,
            category,
            filename,
            blob,
            addedAt: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_ASSETS, 'readwrite');
            tx.objectStore(STORE_ASSETS).put(record);
            tx.oncomplete = () => {
                this.invalidateCache();
                resolve(record);
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async countAssetsInPack(packId: string): Promise<number> {
        const db = this.requireDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_ASSETS, 'readonly');
            const store = tx.objectStore(STORE_ASSETS);
            const req = store.index('packId').count(IDBKeyRange.only(packId));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAssetsByCategory(category: AssetCategory, enabledPacksOnly = true): Promise<AssetRecord[]> {
        const db = this.requireDb();
        const enabledPackIds = enabledPacksOnly
            ? new Set((await this.listPacks()).filter(p => p.enabled).map(p => p.id))
            : null;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_ASSETS, 'readonly');
            const store = tx.objectStore(STORE_ASSETS);
            const req = store.index('category').getAll(IDBKeyRange.only(category));
            req.onsuccess = () => {
                const all = req.result as AssetRecord[];
                const filtered = enabledPackIds
                    ? all.filter(a => enabledPackIds.has(a.packId))
                    : all;
                resolve(filtered);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Flip the user-disabled flag on a single asset. Disabled assets
     * stay in storage (so re-enabling is cheap) but are excluded from
     * the runtime cache. Invalidates the cache so the next
     * `buildCache` call reflects the change.
     */
    async setAssetDisabled(id: string, disabled: boolean): Promise<void> {
        const db = this.requireDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_ASSETS, 'readwrite');
            const store = tx.objectStore(STORE_ASSETS);
            const req = store.get(id);
            req.onsuccess = () => {
                const rec = req.result as AssetRecord | undefined;
                if (!rec) {
                    resolve();
                    return;
                }
                rec.disabled = disabled;
                store.put(rec);
            };
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => {
                this.invalidateCache();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get every stored asset for a category, regardless of pack
     * enablement or disabled flag. Used by the UI to show the full
     * variant list with per-asset checkboxes. Returns a lightweight
     * projection (no blob) so the caller can render hundreds of rows
     * without blowing up memory.
     */
    async listAllAssets(category: AssetCategory): Promise<Array<{
        id: string;
        packId: string;
        filename: string;
        width?: number;
        height?: number;
        disabled: boolean;
    }>> {
        const records = await this.getAssetsByCategory(category, false);
        return records.map(r => ({
            id: r.id,
            packId: r.packId,
            filename: r.filename,
            width: r.width,
            height: r.height,
            disabled: !!r.disabled,
        }));
    }

    // ── Loaded asset cache ──────────────────────────────────────────

    /**
     * Load all enabled assets into the in-memory cache. Creates
     * HTMLImageElements for each blob so draw operations are instant.
     */
    async buildCache(): Promise<void> {
        this.cache.clear();
        this.cachedPackIds.clear();

        const packs = await this.listPacks();
        const enabled = packs.filter(p => p.enabled);
        for (const pack of enabled) {
            this.cachedPackIds.add(pack.id);
        }

        // Load every asset from enabled packs, group by category
        const categories: AssetCategory[] = [
            'mountain', 'hill', 'plateau', 'volcano',
            'tree', 'pine', 'forest', 'field',
            'house', 'house_human', 'house_elven', 'house_dwarven',
            'hut', 'camp', 'village', 'city',
            'castle', 'fortress', 'tower', 'lighthouse',
            'temple', 'church', 'shrine',
            'tavern', 'forge', 'windmill', 'school',
            'river', 'bridge', 'ship', 'airship',
            'ruins', 'compass', 'border', 'cartouche', 'decoration',
        ];

        for (const cat of categories) {
            const records = await this.getAssetsByCategory(cat, true);
            if (records.length === 0) continue;

            const loaded: LoadedAsset[] = [];
            for (const rec of records) {
                // Skip variants the user has individually disabled
                // (e.g. a mis-classified file they don't want picked).
                if (rec.disabled) continue;
                try {
                    const image = await blobToImage(rec.blob);
                    rec.width = image.naturalWidth;
                    rec.height = image.naturalHeight;
                    loaded.push({ record: rec, image });
                } catch (err) {
                    console.warn(`Failed to decode asset ${rec.id}:`, err);
                }
            }
            this.cache.set(cat, loaded);
        }
    }

    /**
     * Get a random loaded asset for a category.
     * Returns null if no assets are loaded. Uses the given seed for
     * deterministic selection so re-renders of the same map pick the
     * same variant at each position.
     */
    pickAsset(category: AssetCategory, seed: number): LoadedAsset | null {
        const list = this.cache.get(category);
        if (!list || list.length === 0) return null;
        // 32-bit mixing function, robust against negative and large seeds
        const s = Math.floor(seed) | 0;
        const h = (Math.imul(s ^ (s >>> 16), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0;
        const idx = h % list.length;
        return list[idx];
    }

    /**
     * Look up a specific loaded asset by its record id. Used by the
     * manual placement overlay so the user can pin a *specific*
     * variant rather than a random one. Returns null if the id
     * doesn't appear in the current cache (e.g. pack disabled).
     */
    pickAssetById(id: string): LoadedAsset | null {
        for (const list of this.cache.values()) {
            for (const loaded of list) {
                if (loaded.record.id === id) return loaded;
            }
        }
        return null;
    }

    /** Check whether we have any assets for a category. */
    hasCategory(category: AssetCategory): boolean {
        const list = this.cache.get(category);
        return !!list && list.length > 0;
    }

    /** Total number of cached assets, for UI display. */
    totalCached(): number {
        let total = 0;
        for (const list of this.cache.values()) total += list.length;
        return total;
    }

    /** Cached category summary for UI. */
    cachedByCategory(): Record<string, number> {
        const out: Record<string, number> = {};
        for (const [cat, list] of this.cache.entries()) {
            out[cat] = list.length;
        }
        return out;
    }

    /**
     * Return up to N asset records per category for diagnostic display.
     * Used by the AssetPanel to show "what actually got matched" - e.g.
     * the user can verify that files labelled mountains/ really did end
     * up in the mountain category instead of getting mis-classified.
     */
    diagnosticsByCategory(sampleSize = 3): Record<string, {
        count: number;
        samples: Array<{ filename: string; width?: number; height?: number }>;
    }> {
        const out: Record<string, { count: number; samples: Array<{ filename: string; width?: number; height?: number }> }> = {};
        for (const [cat, list] of this.cache.entries()) {
            const samples = list.slice(0, sampleSize).map(l => ({
                filename: l.record.filename,
                width: l.record.width,
                height: l.record.height,
            }));
            out[cat] = { count: list.length, samples };
        }
        return out;
    }

    // ── Cache invalidation ──────────────────────────────────────────

    private invalidateCache(): void {
        this.cache.clear();
        this.cachedPackIds.clear();
    }
}

/** Utility: decode a Blob to an HTMLImageElement. */
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image decode failed'));
        };
        img.src = url;
    });
}

/** Module-level singleton so generators and UI share the same instance. */
let _singleton: AssetStore | null = null;
export function getAssetStore(): AssetStore {
    if (!_singleton) _singleton = new AssetStore();
    return _singleton;
}
