import { useCallback, useState } from 'react';
import type { PackRecord } from '../../engine/assets-runtime';
import type { AssetSummary } from '../../hooks/useAssets';

interface AssetPanelProps {
    packs: PackRecord[];
    summary: AssetSummary;
    loading: boolean;
    error: string | null;
    lastImportMessage: string | null;
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

            {/* Per-category counts, only shown when we have data */}
            {Object.keys(summary.perCategory).length > 0 && (
                <section className="lore-section">
                    <h3 className="lore-section-title">Nach Kategorie</h3>
                    <div className="asset-category-list">
                        {Object.entries(summary.perCategory).map(([cat, count]) => (
                            <div key={cat} className="asset-category-row">
                                <span className="asset-category-name">{cat}</span>
                                <span className="asset-category-count">{count}</span>
                            </div>
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
