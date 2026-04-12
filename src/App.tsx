import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapCanvas, type MapCanvasHandle } from './components/Canvas';
import { StatusBar } from './components/StatusBar';
import { useGenerator } from './hooks/useGenerator';
import { useLore } from './hooks/useLore';
import { useAssets } from './hooks/useAssets';
import { usePlacedAssets, type PlacedAsset } from './hooks/usePlacedAssets';
import { useZoom } from './hooks/useZoom';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { setWorldMapZoom } from './engine/generators/worldmap';
import { renderPlacedAssets } from './engine/placed-assets';
import { exportCanvasAsPNG } from './utils';
import type { ActivePanel } from './components/Sidebar/TabBar';
import type { PlaceMode } from './components/Sidebar/PlacementPanel';

export default function App() {
  const {
    generators,
    activeGenerator,
    config,
    status,
    isGenerating,
    switchGenerator,
    generate,
    rerenderOverlay,
    randomize,
    updateConfig,
    setAfterGenerate,
  } = useGenerator();

  const {
    placements: placedAssets,
    add: addPlacedAsset,
    remove: removePlacedAsset,
    clearForMap: clearPlacedAssetsForMap,
    forMap: placedAssetsForMap,
  } = usePlacedAssets();

  const {
    lore,
    hasLore,
    importFile,
    exportFile,
    clearAll,
    getStats,
  } = useLore();

  const {
    packs: assetPacks,
    summary: assetSummary,
    loading: assetsLoading,
    error: assetsError,
    lastImport: lastAssetImport,
    importFiles: importAssets,
    togglePack: toggleAssetPack,
    deletePack: deleteAssetPack,
    listVariants: listAssetVariants,
    toggleAsset: toggleAssetVariant,
  } = useAssets();

  const zoom = useZoom();

  const [activePanel, setActivePanel] = useState<ActivePanel>('generator');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapCanvasRef = useRef<MapCanvasHandle | null>(null);

  // Manual place-mode state. Starts inactive with a sensible default.
  const [placeMode, setPlaceMode] = useState<PlaceMode>({
    active: false,
    category: 'tree',
    variantId: null,
    size: 14,
  });

  // Current view state (zoom/pan) reported from MapCanvas so we can
  // show it in the StatusBar and wire up the reset button
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const pendingViewRef = useRef(view);
  const viewFrameRef = useRef<number | null>(null);
  const handleViewChange = useCallback((v: typeof view) => {
    pendingViewRef.current = v;
    if (viewFrameRef.current !== null) return;
    viewFrameRef.current = requestAnimationFrame(() => {
      viewFrameRef.current = null;
      const next = pendingViewRef.current;
      setView(prev => (
        prev.zoom === next.zoom && prev.panX === next.panX && prev.panY === next.panY
          ? prev
          : next
      ));
    });
  }, []);
  useEffect(() => () => {
    if (viewFrameRef.current !== null) {
      cancelAnimationFrame(viewFrameRef.current);
      viewFrameRef.current = null;
    }
  }, []);
  const handleResetView = useCallback(() => {
    mapCanvasRef.current?.resetView();
  }, []);

  // Pass the zoom controller to the worldmap generator once on mount
  useEffect(() => {
    setWorldMapZoom(zoom.controller);
  }, [zoom.controller]);

  // Register the placed-assets overlay as the generator's after-hook.
  // Reads from the *latest* placements via a ref-like closure so the
  // hook doesn't need to be re-registered on every placement change.
  const placedAssetsRef = useRef(placedAssets);
  useEffect(() => { placedAssetsRef.current = placedAssets; }, [placedAssets]);
  useEffect(() => {
    setAfterGenerate((canvas, generatorId, cfg) => {
      const seed = typeof cfg.seed === 'number' ? cfg.seed : 0;
      const list = placedAssetsRef.current.filter(
        p => p.generatorId === generatorId && p.mapSeed === seed,
      );
      renderPlacedAssets(canvas, list);
    });
    return () => setAfterGenerate(null);
  }, [setAfterGenerate]);

  // Re-render whenever placements change (add/remove) so the overlay
  // updates immediately. Skip the first mount - the canvas-ready
  // effect already does the initial render. We reuse the cached base
  // snapshot via `rerenderOverlay` so adding or removing a placement
  // is O(pixels) instead of re-running the procedural generator. On
  // the very first placement change there may be no snapshot yet
  // (e.g. load from storage before the canvas is ready); in that
  // case fall back to a full generate.
  const firstPlacementSync = useRef(true);
  useEffect(() => {
    if (firstPlacementSync.current) {
      firstPlacementSync.current = false;
      return;
    }
    if (!canvasRef.current || !activeGenerator) return;
    if (!rerenderOverlay()) {
      generate(canvasRef.current);
    }
  }, [placedAssets, activeGenerator, generate, rerenderOverlay]);

  // When the zoom level changes to 'city', auto-switch to the city
  // generator using the clicked city's data. Going back to 'world'
  // switches back to the world generator.
  //
  // This effect is a zoom-level -> generator sync: it must run on
  // real zoom transitions (level change OR target-city change) but
  // NOT when the user manually picks a different generator from the
  // sidebar. Listing `activeGenerator` in deps would cause a manual
  // "pick battlemap" selection to be reverted to worldmap, because
  // the effect would re-fire seeing zoom.level==='world' and
  // activeGenerator.id !== 'worldmap'.
  //
  // We key the bail check off a (level + target-id) fingerprint so
  // the effect also re-runs when the user clicks a DIFFERENT city
  // while still at city-zoom level (e.g. after manually switching
  // back to worldmap mid-zoom).
  const prevZoomKeyRef = useRef<string>('');
  const zoomSyncMountedRef = useRef(false);
  useEffect(() => {
    const zoomKey = `${zoom.level}:${zoom.data?.id ?? zoom.data?.name ?? ''}:${zoom.data?.seed ?? ''}`;
    const prevKey = prevZoomKeyRef.current;
    prevZoomKeyRef.current = zoomKey;
    const isFirstRun = !zoomSyncMountedRef.current;
    zoomSyncMountedRef.current = true;
    // Bail unless this is the first run or the zoom target actually
    // changed. `generators` populating on mount still lets the first
    // run through.
    if (!isFirstRun && prevKey === zoomKey) return;

    if (zoom.level === 'city' && zoom.data) {
      const cityGen = generators.find(g => g.id === 'citymap');
      if (cityGen && activeGenerator?.id !== 'citymap') {
        switchGenerator('citymap');
      }
      // Pass the worldmap's city attributes into the citymap config
      // so the generated citymap shows the correct name, size, and
      // architectural style instead of inventing its own.
      if (zoom.data.seed !== undefined) {
        updateConfig('seed', zoom.data.seed);
      }
      if (zoom.data.id) {
        updateConfig('loreCityId', zoom.data.id);
      }
      if (zoom.data.name) {
        updateConfig('_cityName', zoom.data.name);
      }
      if (zoom.data.size) {
        updateConfig('citySize', zoom.data.size);
      }
      if (zoom.data.style) {
        updateConfig('style', zoom.data.style);
      }
      if (zoom.data.isCapital) {
        updateConfig('hasCastle', true);
      }
    } else if (zoom.level === 'world' && activeGenerator?.id !== 'worldmap') {
      switchGenerator('worldmap');
    }
    // Intentionally omit `activeGenerator` from deps: we only want
    // this sync to fire on zoom target changes, not on manual
    // generator switches from the sidebar. `activeGenerator` is
    // still read inside for the idempotent guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom.level, zoom.data, generators, switchGenerator, updateConfig]);

  // Format last import result as a user-facing message
  const lastAssetImportMessage = useMemo(() => {
    if (!lastAssetImport) return null;
    const { pack, imported, skipped } = lastAssetImport;
    const base = `"${pack.name}" importiert: ${imported} Assets`;
    return skipped > 0 ? `${base} (${skipped} uebersprungen)` : base;
  }, [lastAssetImport]);

  // Skip counts for the diagnostic breakdown
  const lastAssetSkipCounts = useMemo(
    () => lastAssetImport?.skipCounts ?? null,
    [lastAssetImport],
  );

  // Generate when canvas is ready or config changes
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
    zoom.bindCanvas(canvas);
    generate(canvas);
  }, [generate, zoom]);

  // Auto-regenerate when config changes - but debounced so dragging
  // a slider doesn't trigger a render on every intermediate value.
  // 100 ms is the sweet spot: long enough to coalesce ~6 slider
  // events but short enough that click-to-zoom transitions (which
  // flow through the same debouncedConfig path after switchGenerator
  // + updateConfig) feel immediate.
  const debouncedConfig = useDebouncedValue(config, 100);
  useEffect(() => {
    if (canvasRef.current && activeGenerator) {
      generate(canvasRef.current);
    }
  }, [debouncedConfig]);

  // Battle-map token placement needs interaction handlers attached to
  // the canvas. setupInteraction returns a cleanup that must run when
  // the user switches to a different generator so the listeners don't
  // leak and fire on the wrong map.
  //
  // We pass both a full `regenerate` (for clicks that mutate tokens
  // and need the procedural generator to redraw them) and a cheap
  // `rerenderOverlay` (for mousemove hover highlights, which just
  // need to restore the base + redraw placements + draw the hover
  // rect). Without this split, every hovered grid cell used to
  // trigger a full procedural regen, which was the #1 source of
  // battle-map lag.
  useEffect(() => {
    if (!canvasRef.current || !activeGenerator) return;
    const inst = activeGenerator.instance as any;
    if (activeGenerator.id === 'battlemap' && typeof inst.setupInteraction === 'function') {
      const cleanup = inst.setupInteraction(canvasRef.current, {
        regenerate: () => {
          if (canvasRef.current) generate(canvasRef.current);
        },
        rerenderOverlay: () => rerenderOverlay(),
      });
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
    return undefined;
  }, [activeGenerator, generate, rerenderOverlay]);

  // Re-render once the asset cache finishes loading (so the first
  // render after page load can pick up PNG assets from IndexedDB)
  const prevAssetsLoading = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevAssetsLoading.current === true && assetsLoading === false) {
      if (canvasRef.current && activeGenerator) {
        generate(canvasRef.current);
      }
    }
    prevAssetsLoading.current = assetsLoading;
  }, [assetsLoading, activeGenerator, generate]);

  const handleSelectGenerator = useCallback((id: string) => {
    setActivePanel('generator');
    switchGenerator(id);
  }, [switchGenerator]);

  const handleGenerate = useCallback(() => {
    generate(canvasRef.current);
  }, [generate]);

  const handleRandomize = useCallback(() => {
    randomize();
  }, [randomize]);

  const handleExport = useCallback(() => {
    if (canvasRef.current) {
      const genLabel = activeGenerator?.label || 'karte';
      const filename = `calyndra-${genLabel.toLowerCase()}-${config.seed}.png`;
      exportCanvasAsPNG(canvasRef.current, filename);
    }
  }, [activeGenerator, config.seed]);

  const handleAssetsImport = useCallback(async (files: File[]) => {
    await importAssets(files);
    // Re-render current map so new assets show up immediately
    if (canvasRef.current) {
      generate(canvasRef.current);
    }
  }, [importAssets, generate]);

  const handleAssetsToggle = useCallback(async (id: string, enabled: boolean) => {
    await toggleAssetPack(id, enabled);
    if (canvasRef.current) generate(canvasRef.current);
  }, [toggleAssetPack, generate]);

  const handleAssetsDelete = useCallback(async (id: string) => {
    await deleteAssetPack(id);
    if (canvasRef.current) generate(canvasRef.current);
  }, [deleteAssetPack, generate]);

  // Toggling a single variant's disabled flag rebuilds the asset
  // cache, so re-render the current map so the change shows up.
  const handleAssetsToggleVariant = useCallback(async (id: string, disabled: boolean) => {
    await toggleAssetVariant(id, disabled);
    if (canvasRef.current) generate(canvasRef.current);
  }, [toggleAssetVariant, generate]);

  // ── Manual placement ────────────────────────────────────────────

  // Derived: placements belonging to the currently-active map.
  const currentSeed = typeof config.seed === 'number' ? config.seed : 0;
  const currentMapPlacements = useMemo(
    () => (activeGenerator ? placedAssetsForMap(activeGenerator.id, currentSeed) : []),
    [activeGenerator, currentSeed, placedAssetsForMap],
  );

  // Canvas click handler: only active in place mode. Adds a new
  // placement at the clicked spot using the current placeMode brush.
  const handleCanvasClick = useCallback((nx: number, ny: number) => {
    if (!placeMode.active || !activeGenerator) return;
    addPlacedAsset({
      generatorId: activeGenerator.id,
      mapSeed: currentSeed,
      category: placeMode.category,
      variantId: placeMode.variantId ?? undefined,
      nx,
      ny,
      size: placeMode.size,
    });
  }, [placeMode, activeGenerator, currentSeed, addPlacedAsset]);

  const handleClearMapPlacements = useCallback(() => {
    if (!activeGenerator) return;
    clearPlacedAssetsForMap(activeGenerator.id, currentSeed);
  }, [activeGenerator, currentSeed, clearPlacedAssetsForMap]);

  // ── Map save / load (F1d) ───────────────────────────────────────

  const handleSaveMap = useCallback(() => {
    if (!activeGenerator) return;
    const payload = {
      version: 1 as const,
      savedAt: new Date().toISOString(),
      generatorId: activeGenerator.id,
      generatorLabel: activeGenerator.label,
      config,
      placedAssets: currentMapPlacements,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calyndra-${activeGenerator.id}-seed${currentSeed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeGenerator, config, currentSeed, currentMapPlacements]);

  const handleLoadMap = useCallback(async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        version?: number;
        generatorId?: string;
        config?: Record<string, unknown>;
        placedAssets?: PlacedAsset[];
      };
      if (parsed.version !== 1 || !parsed.generatorId || !parsed.config) {
        return { success: false, message: 'Ungültiges Karten-Format.' };
      }
      // Switch to the saved generator if needed
      if (activeGenerator?.id !== parsed.generatorId) {
        const target = generators.find(g => g.id === parsed.generatorId);
        if (target) switchGenerator(parsed.generatorId);
      }
      // Apply saved config one key at a time so we hit the debounced
      // regen exactly once (React batches these within the same tick)
      for (const [k, v] of Object.entries(parsed.config)) {
        updateConfig(k, v);
      }
      // Replace this map's placements. Strip stale ids by re-adding,
      // but keep the same (generatorId, mapSeed) so they attach to
      // the freshly-loaded map.
      if (Array.isArray(parsed.placedAssets)) {
        const seed = typeof parsed.config.seed === 'number' ? parsed.config.seed : 0;
        const gid = parsed.generatorId;
        // First clear any existing placements for this map, then add loaded ones
        clearPlacedAssetsForMap(gid, seed);
        for (const p of parsed.placedAssets) {
          addPlacedAsset({
            generatorId: gid,
            mapSeed: seed,
            category: p.category,
            variantId: p.variantId,
            nx: p.nx,
            ny: p.ny,
            size: p.size,
          });
        }
      }
      return { success: true, message: `Karte geladen (${parsed.placedAssets?.length ?? 0} Platzierungen).` };
    } catch (err: any) {
      return { success: false, message: `Fehler: ${err.message}` };
    }
  }, [activeGenerator, generators, switchGenerator, updateConfig, clearPlacedAssetsForMap, addPlacedAsset]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'r': case 'R':
          e.preventDefault();
          handleRandomize();
          break;
        case 'g': case 'G':
          e.preventDefault();
          handleGenerate();
          break;
        case 'e': case 'E':
          if (e.ctrlKey) { e.preventDefault(); handleExport(); }
          break;
        case 'Escape':
          // Escape priority: first leave place-mode, then zoom out.
          // Place-mode feels like a modal tool, so getting out of it
          // with ESC is more important than one-level zoom-out.
          if (placeMode.active) {
            e.preventDefault();
            setPlaceMode(m => ({ ...m, active: false }));
          } else if (zoom.isZoomed) {
            e.preventDefault();
            zoom.zoomOut();
          }
          break;
        case 'Backspace':
          // Same as Escape - backspace feels natural for "go back" in
          // map navigation. Skipped when typing in a field.
          if (zoom.isZoomed) {
            e.preventDefault();
            zoom.zoomOut();
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleRandomize, handleGenerate, handleExport, zoom, placeMode.active]);

  return (
    <div className="app-layout">
      <Sidebar
        generators={generators}
        activeGenerator={activeGenerator}
        config={config}
        activePanel={activePanel}
        lore={lore}
        hasLore={hasLore}
        assetPacks={assetPacks}
        assetSummary={assetSummary}
        assetsLoading={assetsLoading}
        assetsError={assetsError}
        lastAssetImportMessage={lastAssetImportMessage}
        lastAssetSkipCounts={lastAssetSkipCounts}
        onSelectGenerator={handleSelectGenerator}
        onSelectLore={() => setActivePanel('lore')}
        onSelectAssets={() => setActivePanel('assets')}
        onUpdateConfig={updateConfig}
        onGenerate={handleGenerate}
        onRandomize={handleRandomize}
        onExport={handleExport}
        onLoreImport={importFile}
        onLoreExport={exportFile}
        onLoreClear={clearAll}
        getLoreStats={getStats}
        onAssetsImport={handleAssetsImport}
        onAssetsTogglePack={handleAssetsToggle}
        onAssetsDeletePack={handleAssetsDelete}
        onAssetsListVariants={listAssetVariants}
        onAssetsToggleVariant={handleAssetsToggleVariant}
        placedAssetsForMap={currentMapPlacements}
        placeMode={placeMode}
        onPlaceModeChange={setPlaceMode}
        onRemovePlacement={removePlacedAsset}
        onClearMapPlacements={handleClearMapPlacements}
        onSaveMap={handleSaveMap}
        onLoadMap={handleLoadMap}
        onSelectPlace={() => setActivePanel('place')}
      />

      <main className="main-content">
        <MapCanvas
          ref={mapCanvasRef}
          onCanvasReady={handleCanvasReady}
          width={config.width as number}
          height={config.height as number}
          onViewChange={handleViewChange}
          onCanvasClick={handleCanvasClick}
          canvasClassName={placeMode.active ? 'place-mode-cursor' : undefined}
        />
        <StatusBar
          status={status}
          isGenerating={isGenerating}
          view={view}
          onResetView={handleResetView}
          breadcrumbs={zoom.breadcrumbs}
          onBreadcrumbJump={zoom.jumpTo}
          onZoomOut={zoom.zoomOut}
          isZoomed={zoom.isZoomed}
        />
      </main>
    </div>
  );
}
