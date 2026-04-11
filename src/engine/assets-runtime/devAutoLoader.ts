/**
 * Dev-only auto-loader for `private-assets/` folder.
 *
 * In dev mode (`npm run dev`) Vite's import.meta.glob scans for any
 * PNG/JPG/WEBP files under `/private-assets/**` and this module
 * imports them into the AssetStore on app startup so the developer
 * doesn't have to drag-drop them through the UI every time.
 *
 * In production builds (GitHub Pages), import.meta.glob with
 * { eager: false } is still compiled but the glob pattern resolves to
 * an empty object because the `private-assets/` folder is not part of
 * the build output. So nothing happens at runtime.
 *
 * The whole function early-returns under `import.meta.env.DEV === false`
 * for extra safety.
 */

import type { AssetStore } from './AssetStore';
import { classifyFilename } from './classifier';
import type { PackRecord } from './types';

const DEV_PACK_ID = 'dev_private_assets';
const DEV_PACK_NAME = 'Dev: private-assets/';

/**
 * Find and load all PNGs under private-assets/ into a dev pack.
 * Returns the number of assets loaded, or 0 if not in dev mode.
 */
export async function autoLoadDevAssets(store: AssetStore): Promise<number> {
    if (!import.meta.env.DEV) return 0;

    // Vite's import.meta.glob resolves at build/dev-server time.
    // Pattern is relative to this file: up two dirs (src/engine/assets-runtime
    // -> src/engine -> src) then up to project root, then into private-assets.
    // We use a relative glob that works from this file's location.
    const modules = import.meta.glob(
        '/private-assets/**/*.{png,jpg,jpeg,webp}',
        { query: '?url', import: 'default', eager: false },
    );

    const paths = Object.keys(modules);
    if (paths.length === 0) return 0;

    // Skip if the dev pack already exists and has the same number of assets
    // (avoids re-importing on every HMR reload)
    const existing = await store.getPack(DEV_PACK_ID);
    if (existing && existing.assetCount === paths.length) {
        return existing.assetCount;
    }

    // Clean out any previous dev pack before re-importing
    if (existing) {
        await store.deletePack(DEV_PACK_ID);
    }

    let loaded = 0;
    for (const path of paths) {
        try {
            // Load the URL via the glob factory, then fetch the blob
            const loader = modules[path] as () => Promise<string>;
            const url = await loader();
            const res = await fetch(url);
            if (!res.ok) continue;
            const blob = await res.blob();

            // Strip the '/private-assets/' prefix so the classifier sees
            // 'mountains/peak_01.png' instead of an absolute path
            const relativePath = path.replace(/^\/private-assets\//, '');
            const category = classifyFilename(relativePath);
            if (!category) continue;

            const filename = relativePath.split('/').pop() ?? relativePath;
            await store.addAsset(DEV_PACK_ID, filename, blob, category);
            loaded++;
        } catch (err) {
            console.warn(`Failed to auto-load ${path}:`, err);
        }
    }

    const pack: PackRecord = {
        id: DEV_PACK_ID,
        name: DEV_PACK_NAME,
        addedAt: Date.now(),
        enabled: true,
        assetCount: loaded,
        license: 'local dev only',
    };
    await store.putPack(pack);

    return loaded;
}
