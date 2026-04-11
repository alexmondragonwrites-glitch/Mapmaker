/**
 * Manual placement + map save/load panel.
 *
 * Two responsibilities:
 *
 *   1. Place-mode: pick a category (and optionally a specific
 *      variant) + size, toggle "Platzieren aktiv", then click the
 *      canvas to drop assets onto the map.
 *
 *   2. Map save/load: serialize the current map state (config +
 *      placed assets for this seed) to JSON and download / re-import
 *      later. Mirrors the Lore panel's save/load pattern so users
 *      don't have to learn another flow.
 *
 * Placed-asset rows are listed with a delete button, and a "Alle
 * löschen" button wipes every placement for the current map.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AssetCategory } from '../../engine/assets-runtime';
import type { PlacedAsset } from '../../hooks/usePlacedAssets';
import type { AssetSummary, AssetVariantRow } from '../../hooks/useAssets';

/** Categories the user is most likely to want to place manually. */
const PLACEMENT_CATEGORIES: AssetCategory[] = [
    'mountain', 'hill', 'volcano',
    'tree', 'pine', 'forest',
    'house', 'house_human', 'house_elven', 'house_dwarven',
    'hut', 'village', 'city',
    'castle', 'fortress', 'tower', 'lighthouse',
    'temple', 'church', 'shrine',
    'tavern', 'forge', 'windmill',
    'bridge', 'ship', 'ruins',
    'compass', 'cartouche', 'decoration',
];

export interface PlaceMode {
    active: boolean;
    category: AssetCategory;
    variantId: string | null;
    size: number;
}

interface PlacementPanelProps {
    /** Active map id for map-specific messages. */
    activeGeneratorId: string;
    activeGeneratorLabel: string;
    currentSeed: number;

    /** All placements (filtered by generator+seed for display). */
    placedAssetsForMap: PlacedAsset[];
    onRemovePlacement: (id: string) => void;
    onClearMap: () => void;

    /** Place-mode state and setters. */
    placeMode: PlaceMode;
    onPlaceModeChange: (mode: PlaceMode) => void;

    /** Asset summary + variant lookup for the category/variant pickers. */
    assetSummary: AssetSummary;
    onListVariants: (category: AssetCategory) => Promise<AssetVariantRow[]>;

    /** Map save/load actions. */
    onSaveMap: () => void;
    onLoadMap: (file: File) => Promise<{ success: boolean; message: string }>;
}

export function PlacementPanel({
    activeGeneratorId,
    activeGeneratorLabel,
    currentSeed,
    placedAssetsForMap,
    onRemovePlacement,
    onClearMap,
    placeMode,
    onPlaceModeChange,
    assetSummary,
    onListVariants,
    onSaveMap,
    onLoadMap,
}: PlacementPanelProps) {
    // Variant rows for the currently-selected category, lazy-loaded.
    const [variants, setVariants] = useState<AssetVariantRow[]>([]);
    const [variantLoading, setVariantLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setVariantLoading(true);
        onListVariants(placeMode.category).then(list => {
            if (cancelled) return;
            // Only show active (non-disabled) variants - you can't
            // place something that the picker has been told to hide.
            setVariants(list.filter(v => !v.disabled));
            setVariantLoading(false);
        }).catch(() => {
            if (!cancelled) setVariantLoading(false);
        });
        return () => { cancelled = true; };
    }, [placeMode.category, onListVariants]);

    // Load-map file input handler
    const [loadMessage, setLoadMessage] = useState<string | null>(null);
    const handleLoadFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const result = await onLoadMap(file);
        setLoadMessage(result.message);
        e.target.value = '';
    }, [onLoadMap]);

    const assetsForCategory = assetSummary.perCategory[placeMode.category] ?? 0;
    const mapHasPlacements = placedAssetsForMap.length > 0;

    return (
        <div className="lore-panel">
            {/* Intro blurb */}
            <section className="lore-section">
                <h3 className="lore-section-title">Assets platzieren</h3>
                <div className="asset-intro">
                    Wähle eine Kategorie, aktiviere <strong>Platzieren</strong> und klicke
                    auf die Karte, um Assets zu setzen. Platzierungen sind pro Karte
                    (Generator&nbsp;+&nbsp;Seed) gespeichert und überleben Re-Renders.
                </div>
            </section>

            {/* Category picker */}
            <section className="lore-section">
                <h3 className="lore-section-title">Kategorie</h3>
                <select
                    className="placement-input"
                    value={placeMode.category}
                    onChange={(e) => onPlaceModeChange({
                        ...placeMode,
                        category: e.target.value as AssetCategory,
                        variantId: null, // reset variant when category changes
                    })}
                >
                    {PLACEMENT_CATEGORIES.map(cat => {
                        const count = assetSummary.perCategory[cat] ?? 0;
                        return (
                            <option key={cat} value={cat} disabled={count === 0}>
                                {cat} ({count})
                            </option>
                        );
                    })}
                </select>
                <div className="placement-hint">
                    {assetsForCategory === 0
                        ? 'Keine Assets in dieser Kategorie geladen.'
                        : `${assetsForCategory} Varianten aktiv`}
                </div>
            </section>

            {/* Variant picker */}
            <section className="lore-section">
                <h3 className="lore-section-title">Variante</h3>
                <select
                    className="placement-input"
                    value={placeMode.variantId ?? ''}
                    onChange={(e) => onPlaceModeChange({
                        ...placeMode,
                        variantId: e.target.value || null,
                    })}
                    disabled={variantLoading || variants.length === 0}
                >
                    <option value="">Zufällig (empfohlen)</option>
                    {variants.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.filename}
                        </option>
                    ))}
                </select>
                {variantLoading && (
                    <div className="placement-hint">Lade Varianten…</div>
                )}
            </section>

            {/* Size slider */}
            <section className="lore-section">
                <h3 className="lore-section-title">Größe</h3>
                <input
                    type="range"
                    min={4}
                    max={60}
                    step={1}
                    value={placeMode.size}
                    onChange={(e) => onPlaceModeChange({
                        ...placeMode,
                        size: Number(e.target.value),
                    })}
                    className="placement-input"
                />
                <div className="placement-hint">{placeMode.size} px Basisgröße</div>
            </section>

            {/* Place-mode toggle */}
            <section className="lore-section">
                <button
                    className={`btn ${placeMode.active ? 'btn-primary' : ''}`}
                    onClick={() => onPlaceModeChange({ ...placeMode, active: !placeMode.active })}
                    disabled={assetsForCategory === 0}
                >
                    {placeMode.active ? '⏸ Platzieren beenden' : '▶ Platzieren starten'}
                </button>
                {placeMode.active && (
                    <div className="placement-hint active">
                        Klicke auf die Karte zum Platzieren. ESC oder Klick hier zum Beenden.
                    </div>
                )}
            </section>

            {/* Placement list */}
            <section className="lore-section">
                <h3 className="lore-section-title">
                    Platzierungen ({placedAssetsForMap.length})
                </h3>
                {!mapHasPlacements && (
                    <div className="asset-empty">
                        Noch nichts platziert auf {activeGeneratorLabel} (Seed {currentSeed}).
                    </div>
                )}
                <div className="lore-list">
                    {placedAssetsForMap.map(p => (
                        <div key={p.id} className="lore-card">
                            <div className="lore-card-header">
                                <span className="lore-card-name">{p.category}</span>
                                <button
                                    className="lore-card-delete"
                                    onClick={() => onRemovePlacement(p.id)}
                                    title="Entfernen"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="asset-pack-meta">
                                ({(p.nx * 100).toFixed(1)}%, {(p.ny * 100).toFixed(1)}%)
                                · {p.size}px
                            </div>
                        </div>
                    ))}
                </div>
                {mapHasPlacements && (
                    <button
                        className="btn"
                        onClick={() => {
                            if (confirm(`Alle ${placedAssetsForMap.length} Platzierungen auf dieser Karte löschen?`)) {
                                onClearMap();
                            }
                        }}
                    >
                        Alle löschen
                    </button>
                )}
            </section>

            {/* Map save / load */}
            <section className="lore-section">
                <h3 className="lore-section-title">Karte speichern / laden</h3>
                <div className="asset-intro">
                    Speichert Seed, Konfiguration und alle Platzierungen dieser Karte als JSON-Datei.
                </div>
                <div className="lore-action-row">
                    <button
                        className="btn btn-primary"
                        onClick={onSaveMap}
                        title={`${activeGeneratorLabel} · Seed ${currentSeed}`}
                    >
                        💾 Karte speichern
                    </button>
                    <label className="btn" style={{ cursor: 'pointer' }}>
                        📂 Karte laden
                        <input
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleLoadFile}
                        />
                    </label>
                </div>
                {loadMessage && (
                    <div className="lore-status success">{loadMessage}</div>
                )}
            </section>
        </div>
    );
}
