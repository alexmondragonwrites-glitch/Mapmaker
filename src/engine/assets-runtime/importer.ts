/**
 * Asset import helpers.
 *
 * Accepts:
 *  - A File that is a ZIP archive (uses fflate to unpack)
 *  - A FileList from a folder drop (each PNG goes in individually)
 *  - Individual Files from a normal <input type=file>
 *
 * Each imported image is classified, stored via AssetStore, and
 * attributed to a pack. Unknown files are skipped with a reason
 * recorded in ImportResult.skippedReasons for the diagnostic UI.
 */

import { unzip, type Unzipped } from 'fflate';
import type { AssetStore } from './AssetStore';
import type { PackRecord } from './types';
import { classifyFilename } from './classifier';

export interface ImportResult {
    pack: PackRecord;
    imported: number;
    skipped: number;
    /** Paths of files that were considered but rejected, with reason. */
    skippedReasons: Array<{ path: string; reason: string }>;
    /** Breakdown of skip reasons for quick UI display. */
    skipCounts: Record<string, number>;
}

// ── Wonderdraft variant filtering ──────────────────────────────────
//
// A Wonderdraft asset typically exists in 3 variants with NO underscore
// between the base name and the variant suffix:
//
//   013lordcastlenormal.png    <- wanted
//   013lordcastlesample.png    <- thumbnail, reject
//   013lordcastlecustom.png    <- monochrome template, reject
//
// Some packs use `NB` (Noir/Blanc) instead of `custom`, or `colors`
// instead of `sample`. Fairy packs also use `_colors` and `_custom`
// WITH underscore, and the "normal" variant has no suffix at all:
//
//   castle.png         <- the real one
//   castle_colors.png  <- reject (monochrome)
//   castle_custom.png  <- reject (template)
//
// The filter therefore has three rules:
//   1. Explicit normal variant (ends with `normal`) -> accept
//   2. Variant suffix (sample/custom/colors/NB) -> reject
//   3. No recognizable suffix -> accept, UNLESS the pack also contains
//      the `...normal` version of the same base, in which case skip
//      this one (the normal version wins the duplicate)

const VARIANT_SUFFIX_RE = /(sample|custom|colors?|nb)\.(png|jpg|jpeg|webp)$/i;
const NORMAL_SUFFIX_RE = /normal\.(png|jpg|jpeg|webp)$/i;

/**
 * Stateless path check: rejects files that are clearly not map assets
 * (fonts, textures, OS metadata) or have an explicit non-normal variant
 * suffix. Files with no suffix are left to the dedupe pass.
 */
export function shouldSkipPath(path: string): string | null {
    const lower = path.toLowerCase();

    // OS / hidden files
    if (lower.includes('__macosx')) return 'macos metadata';
    if (lower.split('/').some(p => p.startsWith('.'))) return 'hidden';

    // Non-image files
    if (!/\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'not an image';

    // Explicit standalone metadata images
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

    // Wonderdraft variant suffixes: sample, custom, colors, NB
    const basename = lower.split('/').pop() ?? '';
    if (VARIANT_SUFFIX_RE.test(basename)) {
        // Extract which variant for the diagnostic
        const match = basename.match(VARIANT_SUFFIX_RE);
        return match ? `variant: ${match[1]}` : 'variant';
    }

    // Passed all reject rules - accept for now. Dedup pass may still
    // drop this if a `...normal` sibling exists.
    return null;
}

/**
 * Strip the extension AND any "normal" suffix from a basename so we
 * can detect duplicate entries (e.g. castle.png and castlenormal.png
 * are the same base "castle").
 */
function baseNameKey(path: string): string {
    const lower = path.toLowerCase();
    const filename = lower.split('/').pop() ?? '';
    // Strip extension
    let base = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    // Strip "normal" suffix (with or without underscore)
    base = base.replace(/_?normal$/i, '');
    return base;
}

/**
 * Given a list of paths that passed shouldSkipPath, compute which
 * entries should be dropped because a better "normal" sibling exists.
 *
 * Returns a Set of path strings to reject.
 */
function computeDedupeRejects(paths: string[]): Set<string> {
    // Build set of base keys that have an explicit "normal" version
    const hasNormal = new Set<string>();
    for (const path of paths) {
        const basename = path.toLowerCase().split('/').pop() ?? '';
        if (NORMAL_SUFFIX_RE.test(basename)) {
            hasNormal.add(baseNameKey(path));
        }
    }

    // Reject the non-normal paths whose base key is in hasNormal
    const reject = new Set<string>();
    for (const path of paths) {
        const basename = path.toLowerCase().split('/').pop() ?? '';
        if (NORMAL_SUFFIX_RE.test(basename)) continue; // keep normal entries
        if (hasNormal.has(baseNameKey(path))) {
            reject.add(path);
        }
    }
    return reject;
}

// ── Import entry points ─────────────────────────────────────────────

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

    // Pass 1: gather paths that pass the stateless skip check
    const candidates: Array<{ path: string; bytes: Uint8Array }> = [];
    const skippedReasons: Array<{ path: string; reason: string }> = [];
    const skipCounts: Record<string, number> = {};

    const addSkip = (path: string, reason: string) => {
        skippedReasons.push({ path, reason });
        skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
    };

    for (const [path, bytes] of Object.entries(unpacked)) {
        if (path.endsWith('/') || bytes.length === 0) continue;
        const reason = shouldSkipPath(path);
        if (reason) {
            addSkip(path, reason);
            continue;
        }
        candidates.push({ path, bytes: bytes as Uint8Array });
    }

    // Pass 2: dedup where a "normal" sibling exists
    const dedupeRejects = computeDedupeRejects(candidates.map(c => c.path));
    let imported = 0;

    for (const { path, bytes } of candidates) {
        if (dedupeRejects.has(path)) {
            addSkip(path, 'duplicate (normal exists)');
            continue;
        }

        const category = classifyFilename(path);
        if (!category) {
            addSkip(path, 'unknown category');
            continue;
        }

        const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
        const filename = path.split('/').pop() ?? path;
        await store.addAsset(packId, filename, blob, category);
        imported++;
    }

    pack.assetCount = imported;
    await store.putPack(pack);

    return {
        pack,
        imported,
        skipped: skippedReasons.length,
        skippedReasons,
        skipCounts,
    };
}

/**
 * Import a batch of individual File objects (folder drop or
 * <input type=file multiple>).
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

    const skippedReasons: Array<{ path: string; reason: string }> = [];
    const skipCounts: Record<string, number> = {};
    const addSkip = (path: string, reason: string) => {
        skippedReasons.push({ path, reason });
        skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
    };

    // Pass 1: gather candidates with their paths
    const candidates: Array<{ file: File; path: string }> = [];
    for (const file of files) {
        const path = (file as any).webkitRelativePath || file.name;
        const reason = shouldSkipPath(path);
        if (reason) {
            addSkip(path, reason);
            continue;
        }
        candidates.push({ file, path });
    }

    // Pass 2: dedup
    const dedupeRejects = computeDedupeRejects(candidates.map(c => c.path));
    let imported = 0;

    for (const { file, path } of candidates) {
        if (dedupeRejects.has(path)) {
            addSkip(path, 'duplicate (normal exists)');
            continue;
        }

        const category = classifyFilename(path);
        if (!category) {
            addSkip(path, 'unknown category');
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
        skipped: skippedReasons.length,
        skippedReasons,
        skipCounts,
    };
}

/**
 * Main entry point used by the UI: examines what was dropped and
 * routes to the right importer.
 */
export async function importDrop(
    store: AssetStore,
    files: File[],
): Promise<ImportResult> {
    if (files.length === 0) {
        throw new Error('No files to import');
    }

    if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        return importZip(store, files[0]);
    }

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
