import { useCallback, useState } from 'react';
import type { PackRecord } from '../../engine/assets-runtime';
import type { AssetSummary, AssetDiagCategory } from '../../hooks/useAssets';

/**
 * One collapsible row in the category diagnostics list. Expands to
 * show up to 5 sample filenames + pixel dimensions of the loaded PNGs
 * so the user can verify classification and catch size outliers.
 */
function CategoryRow({ category, diag }: { category: string; diag: AssetDiagCategory }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`asset-diag-row ${open ? 'expanded' : ''}`}>
            <button
                className="asset-diag-head"
                onClick={() => setOpen(o => !o)}
            >
                <span className="asset-diag-caret">{open ? '▾' : '▸'}</span>
                <span className="asset-diag-name">{category}</span>
                <span className="asset-diag-count">{diag.count}</span>
            </button>
            {open && (
                <ul className="asset-diag-samples">
                    {diag.samples.map((s, i) => (
                        <li key={i}>
                            <span className="asset-diag-file">{s.filename}</span>
                            {s.width && s.height && (
                                <span className="asset-diag-dim">{s.width}×{s.height}</span>
                            )}
                        </li>
                    ))}
                    {diag.count > diag.samples.length && (
                        <li className="asset-diag-more">
                            +{diag.count - diag.samples.length} weitere…
                        </li>
                    )}
                </ul>
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
                                <CategoryRow key={cat} category={cat} diag={diag} />
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
