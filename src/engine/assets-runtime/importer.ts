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
 * Wonderdraft asset packs contain THREE variants per asset, with NO
 * underscore between the base name and the variant suffix:
 *   - farmhousenormal.png  <- the actual map asset (want!)
 *   - farmhousesample.png  <- tiny thumbnail shown in UI (reject)
 *   - farmhousecustom.png  <- placeholder/alternate (reject)
 *
 * The user spotted this from an actual Wonderdraft file listing:
 * `farmhousenormal.png`. The original blacklist was looking for
 * `_sample` with an underscore and never matched anything, so all
 * three variants were being imported and the map showed the sample
 * thumbnails as coloured markers.
 *
 * Strategy: whitelist. Only accept image files that end with `normal`
 * before the extension. Everything else is rejected with a reason
 * so the UI can report "skipped: N samples, M custom, ...".
 *
 * Also reject explicit non-asset paths: fonts/, textures/, overlays/,
 * preview/thumbnail/icon/logo standalone files.
 */
export function shouldSkipPath(path: string): string | null {
    const lower = path.toLowerCase();

    // OS / hidden files
    if (lower.includes('__macosx')) return 'macos metadata';
    if (lower.split('/').some(p => p.startsWith('.'))) return 'hidden';

    // Non-image files
    if (!/\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'not an image';

    // Explicit standalone metadata images (pack preview screenshots etc.)
    if (/(?:^|\/)preview\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'preview';
    if (/(?:^|\/)thumbnail\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'thumbnail';
    if (/(?:^|\/)icon\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'icon';
    if (/(?:^|\/)logo\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'logo';

    // Background textures and overlays - tileable, not stamp-style
    if (lower.includes('/textures/ground/')) return 'background texture';
    if (lower.includes('/textures/water/')) return 'background texture';
    if (lower.includes('/textures/paper/')) return 'background texture';
    if (lower.includes('/overlays/')) return 'background overlay';

    // Font folders
    if (lower.includes('/fonts/')) return 'font';

    // Whitelist: only files whose basename ends with "normal" before the
    // extension are the real Wonderdraft map assets.
    // Matches: farmhousenormal.png, pine_normal.jpg, mountain01normal.webp
    // Rejects: farmhousesample.png, farmhousecustom.png, anything else
    const basename = lower.split('/').pop() ?? '';
    if (!/normal\.(png|jpg|jpeg|webp)$/i.test(basename)) {
        return 'not a normal variant';
    }

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
