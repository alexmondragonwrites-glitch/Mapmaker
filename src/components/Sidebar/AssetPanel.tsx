import { useCallback, useEffect, useState } from 'react';
import type { AssetCategory, PackRecord } from '../../engine/assets-runtime';
import type {
    AssetSummary,
    AssetDiagCategory,
    AssetVariantRow,
} from '../../hooks/useAssets';

/**
 * One collapsible row in the category diagnostics list.
 *
 * When closed: shows the category name + loaded variant count.
 * When opened: lazy-loads the full variant list from IndexedDB
 * (via `listVariants`) and renders one checkbox per asset so the
 * user can disable individual mis-classified or ugly variants
 * without deleting the whole pack. Disabled variants stay in
 * storage and can be re-enabled any time.
 */
function CategoryRow({
    category,
    diag,
    listVariants,
    toggleAsset,
}: {
    category: string;
    diag: AssetDiagCategory;
    listVariants: (category: AssetCategory) => Promise<AssetVariantRow[]>;
    toggleAsset: (id: string, disabled: boolean) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState<AssetVariantRow[] | null>(null);
    const [loadingRows, setLoadingRows] = useState(false);

    // Lazy-load the full variant list the first time the row is
    // opened. Also re-loads when `diag.count` changes, so toggling
    // a variant in another panel stays consistent.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingRows(true);
        listVariants(category as AssetCategory).then(list => {
            if (cancelled) return;
            setRows(list);
            setLoadingRows(false);
        }).catch(() => {
            if (!cancelled) setLoadingRows(false);
        });
        return () => { cancelled = true; };
    }, [open, category, listVariants, diag.count]);

    const onToggle = useCallback(async (id: string, newDisabled: boolean) => {
        // Optimistic update so the checkbox flips immediately
        setRows(prev => prev ? prev.map(r =>
            r.id === id ? { ...r, disabled: newDisabled } : r,
        ) : prev);
        try {
            await toggleAsset(id, newDisabled);
        } catch (err) {
            // On failure, revert the optimistic flip
            setRows(prev => prev ? prev.map(r =>
                r.id === id ? { ...r, disabled: !newDisabled } : r,
            ) : prev);
            console.error('Failed to toggle asset', id, err);
        }
    }, [toggleAsset]);

    // Active = present in the loaded cache (diag.count). Total
    // includes disabled variants, so the user sees "3/5 aktiv".
    const activeCount = diag.count;
    const totalCount = rows?.length ?? diag.count;

    return (
        <div className={`asset-diag-row ${open ? 'expanded' : ''}`}>
            <button
                className="asset-diag-head"
                onClick={() => setOpen(o => !o)}
            >
                <span className="asset-diag-caret">{open ? '▾' : '▸'}</span>
                <span className="asset-diag-name">{category}</span>
                <span className="asset-diag-count">
                    {rows ? `${activeCount}/${totalCount}` : activeCount}
                </span>
            </button>
            {open && (
                <div className="asset-variant-list">
                    {loadingRows && !rows && (
                        <div className="asset-variant-loading">Lade Varianten…</div>
                    )}
                    {rows && rows.length === 0 && (
                        <div className="asset-variant-empty">Keine Varianten.</div>
                    )}
                    {rows && rows.map(row => (
                        <label
                            key={row.id}
                            className={`asset-variant-row ${row.disabled ? 'disabled' : ''}`}
                            title={row.id}
                        >
                            <input
                                type="checkbox"
                                checked={!row.disabled}
                                onChange={(e) => onToggle(row.id, !e.target.checked)}
                            />
                            <span className="asset-variant-name">{row.filename}</span>
                            {row.width && row.height && (
                                <span className="asset-variant-dim">
                                    {row.width}×{row.height}
                                </span>
                            )}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

interface AssetPanelProps {
    packs: PackRecord[];
    summary: AssetSummary;
    loading: boolean;
    error: string | null;
    lastImportMessage: string | null;
    lastSkipCounts: Record<string, number> | null;
    onImport: (files: File[]) => Promise<void>;
    onTogglePack: (id: string, enabled: boolean) => Promise<void>;
    onDeletePack: (id: string) => Promise<void>;
    /** Lazy-load the full variant list for one category. */
    onListVariants: (category: AssetCategory) => Promise<AssetVariantRow[]>;
    /** Flip a single variant's disabled flag. */
    onToggleAsset: (id: string, disabled: boolean) => Promise<void>;
}

export function AssetPanel({
    packs,
    summary,
    loading,
    error,
    lastImportMessage,
    lastSkipCounts,
    onImport,
    onTogglePack,
    onDeletePack,
    onListVariants,
    onToggleAsset,
}: AssetPanelProps) {
    const [dragging, setDragging] = useState(false);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);

        // Collect files - handles both loose drops and folder drops
        const items = e.dataTransfer.items;
        const files: File[] = [];
        if (items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
        } else {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                files.push(e.dataTransfer.files[i]);
            }
        }
        if (files.length > 0) {
            await onImport(files);
        }
    }, [onImport]);

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const files: File[] = [];
        for (let i = 0; i < fileList.length; i++) files.push(fileList[i]);
        await onImport(files);
        e.target.value = '';
    }, [onImport]);

    return (
        <div className="asset-panel">
            {/* Intro blurb: explains the privacy model */}
            <section className="lore-section">
                <h3 className="lore-section-title">Asset-Packs</h3>
                <div className="asset-intro">
                    Asset-Pakete werden <strong>nur in deinem Browser</strong> gespeichert (IndexedDB)
                    und niemals an den Server uebertragen. So bleibst du compliant mit kommerziellen
                    Lizenzen wie Wonderdraft.
                </div>
            </section>

            {/* Upload area */}
            <section className="lore-section">
                <div
                    className={`lore-upload-area ${dragging ? 'dragover' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('asset-file-input')?.click()}
                >
                    <div className="upload-icon">📦</div>
                    <div className="upload-text">
                        <strong>ZIP, Ordner oder PNG-Dateien</strong>
                        <br />hierher ziehen oder klicken
                    </div>
                    <input
                        type="file"
                        accept=".zip,.png,.jpg,.jpeg,.webp"
                        multiple
                        className="upload-input"
                        id="asset-file-input"
                        onChange={handleFileInput}
                    />
                </div>

                {loading && <div className="lore-status">Lade Assets...</div>}
                {error && <div className="lore-status error">{error}</div>}
                {lastImportMessage && !error && (
                    <div className="lore-status success">{lastImportMessage}</div>
                )}
                {lastSkipCounts && Object.keys(lastSkipCounts).length > 0 && (
                    <details className="asset-skip-breakdown">
                        <summary>Uebersprungen nach Grund</summary>
                        <ul>
                            {Object.entries(lastSkipCounts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([reason, count]) => (
                                    <li key={reason}>
                                        <span className="asset-skip-reason">{reason}</span>
                                        <span className="asset-skip-count">{count}</span>
                                    </li>
                                ))}
                        </ul>
                    </details>
                )}
            </section>

            {/* Stats */}
            <section className="lore-section">
                <h3 className="lore-section-title">Uebersicht</h3>
                <div className="lore-stats">
                    <div className="stat">
                        <span className="stat-num">{summary.totalPacks}</span>
                        <span className="stat-label">Packs</span>
                    </div>
                    <div className="stat">
                        <span className="stat-num">{summary.enabledPacks}</span>
                        <span className="stat-label">Aktiv</span>
                    </div>
                    <div className="stat">
                        <span className="stat-num">{summary.totalAssets}</span>
                        <span className="stat-label">Assets</span>
                    </div>
                </div>
            </section>

            {/* Per-category counts with expandable diagnostics */}
            {Object.keys(summary.diagnostics).length > 0 && (
                <section className="lore-section">
                    <h3 className="lore-section-title">Diagnose: Kategorien</h3>
                    <div className="asset-intro">
                        Klicke auf eine Kategorie, um Beispiel-Dateinamen zu sehen.
                        So kannst du pruefen, ob die Assets richtig klassifiziert wurden.
                    </div>
                    <div className="asset-diag-list">
                        {Object.entries(summary.diagnostics)
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([cat, diag]) => (
                                <CategoryRow
                                    key={cat}
                                    category={cat}
                                    diag={diag}
                                    listVariants={onListVariants}
                                    toggleAsset={onToggleAsset}
                                />
                            ))}
                    </div>
                </section>
            )}

            {/* Pack list */}
            <section className="lore-section">
                <h3 className="lore-section-title">Installierte Packs</h3>
                {packs.length === 0 && (
                    <div className="asset-empty">
                        Noch keine Packs installiert. Ziehe oben eine ZIP-Datei rein.
                    </div>
                )}
                <div className="lore-list">
                    {packs.map((pack) => (
                        <div key={pack.id} className={`lore-card ${!pack.enabled ? 'disabled' : ''}`}>
                            <div className="lore-card-header">
                                <label className="asset-pack-toggle">
                                    <input
                                        type="checkbox"
                                        checked={pack.enabled}
                                        onChange={(e) => onTogglePack(pack.id, e.target.checked)}
                                    />
                                    <span className="lore-card-name">{pack.name}</span>
                                </label>
                                <button
                                    className="lore-card-delete"
                                    onClick={() => {
                                        if (confirm(`Pack "${pack.name}" loeschen?`)) {
                                            onDeletePack(pack.id);
                                        }
                                    }}
                                    title="Pack entfernen"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="asset-pack-meta">
                                {pack.assetCount} Assets
                                {pack.license && ` · ${pack.license}`}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
