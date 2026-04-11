/**
 * Asset import helpers.
 *
 * Accepts:
 *  - A File that is a ZIP archive (uses fflate to unpack)
 *  - A FileList from a folder drop (each PNG goes in individually)
 *  - Individual Files from a normal <input type=file>
 *
 * Each imported image is classified, stored via AssetStore, and
 * attributed to a pack. Unknown files are skipped with a warning.
 */

import { unzip, type Unzipped } from 'fflate';
import type { AssetStore } from './AssetStore';
import type { PackRecord } from './types';
import { classifyFilename } from './classifier';

export interface ImportResult {
    pack: PackRecord;
    imported: number;
    skipped: number;
    skippedFilenames: string[];
}

/**
 * Decide whether a file path should be skipped during import.
 *
 * Wonderdraft asset packs come with multiple non-asset files:
 *  - `.wonderdraft_symbols` / `.wonderdraft_icon` config blobs
 *  - `_normal.png` (icon), `_custom.png`, `_sample.png` (UI thumbs,
 *    not the actual map asset!). The tiny coloured "marker" icons
 *    the user was seeing on their map came from the _sample variants.
 *  - `preview.png`, `thumbnail.png`, `icon.png`
 *  - `textures/ground/` or `textures/water/` - these are large tileable
 *    background textures, not stamp-style map assets, and putting them
 *    on the map looks horrible
 *  - fonts/ - literal fonts
 *
 * Returns null if the path is OK to import, otherwise a reason string
 * so callers can log or display it.
 */
export function shouldSkipPath(path: string): string | null {
    const lower = path.toLowerCase();

    // OS / hidden files
    if (lower.includes('__macosx')) return 'macos metadata';
    if (lower.split('/').some(p => p.startsWith('.'))) return 'hidden';

    // Non-image files
    if (!/\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'not an image';

    // Wonderdraft internal variants - skip thumbnails and previews
    if (/_sample\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'sample thumbnail';
    if (/_custom\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'custom placeholder';
    if (/(?:^|\/)preview\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'preview';
    if (/(?:^|\/)thumbnail\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'thumbnail';
    if (/(?:^|\/)icon\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'icon';
    if (/(?:^|\/)logo\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'logo';

    // Background textures (tileable ground/water) - not stamp assets
    if (lower.includes('/textures/ground/')) return 'background texture';
    if (lower.includes('/textures/water/')) return 'background texture';
    if (lower.includes('/textures/paper/')) return 'background texture';
    if (lower.includes('/overlays/')) return 'background overlay';

    // Font folders (some packs include fonts even though they are TTF)
    if (lower.includes('/fonts/')) return 'font';

    return null;
}

/**
 * Import a ZIP file. Picks the pack name from the filename.
 */
export async function importZip(
    store: AssetStore,
    file: File,
): Promise<ImportResult> {
    const buf = new Uint8Array(await file.arrayBuffer());
    const unpacked = await unzipAsync(buf);

    const packId = 'pack_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const packName = file.name.replace(/\.zip$/i, '');

    const pack: PackRecord = {
        id: packId,
        name: packName,
        addedAt: Date.now(),
        enabled: true,
        assetCount: 0,
    };

    let imported = 0;
    const skippedFilenames: string[] = [];

    for (const [path, bytes] of Object.entries(unpacked)) {
        // Skip directories (fflate marks them with empty content + trailing slash)
        if (path.endsWith('/') || bytes.length === 0) continue;

        // Apply the skip rules (Wonderdraft variants, previews, textures, ...)
        if (shouldSkipPath(path)) continue;

        const category = classifyFilename(path);
        if (!category) {
            skippedFilenames.push(path);
            continue;
        }

        const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
        // Use the basename, not the full path inside the zip
        const filename = path.split('/').pop() ?? path;
        await store.addAsset(packId, filename, blob, category);
        imported++;
    }

    pack.assetCount = imported;
    await store.putPack(pack);

    return {
        pack,
        imported,
        skipped: skippedFilenames.length,
        skippedFilenames,
    };
}

/**
 * Import a batch of individual File objects. Used when the user drags a
 * folder directly (each entry is a File with a webkitRelativePath).
 */
export async function importFiles(
    store: AssetStore,
    files: File[],
    packName?: string,
): Promise<ImportResult> {
    const packId = 'pack_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    const pack: PackRecord = {
        id: packId,
        name: packName ?? `Import ${new Date().toLocaleString()}`,
        addedAt: Date.now(),
        enabled: true,
        assetCount: 0,
    };

    let imported = 0;
    const skippedFilenames: string[] = [];

    for (const file of files) {
        // Prefer webkitRelativePath so the classifier and skip rules see
        // the full folder context
        const path = (file as any).webkitRelativePath || file.name;
        if (shouldSkipPath(path)) continue;

        const category = classifyFilename(path);
        if (!category) {
            skippedFilenames.push(path);
            continue;
        }

        const blob = file.slice(0, file.size, 'image/png');
        await store.addAsset(packId, file.name, blob, category);
        imported++;
    }

    pack.assetCount = imported;
    await store.putPack(pack);

    return {
        pack,
        imported,
        skipped: skippedFilenames.length,
        skippedFilenames,
    };
}

/**
 * Main entry point used by the UI: examines what was dropped and
 * routes to the right importer. Returns an aggregated result.
 */
export async function importDrop(
    store: AssetStore,
    files: File[],
): Promise<ImportResult> {
    if (files.length === 0) {
        throw new Error('No files to import');
    }

    // Single ZIP file? Route to ZIP importer.
    if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        return importZip(store, files[0]);
    }

    // Multiple files or folder: use the generic importer
    return importFiles(store, files);
}

// ── Promisified fflate wrapper ─────────────────────────────────────

function unzipAsync(buf: Uint8Array): Promise<Unzipped> {
    return new Promise((resolve, reject) => {
        unzip(buf, (err, unzipped) => {
            if (err) reject(err);
            else resolve(unzipped);
        });
    });
}
