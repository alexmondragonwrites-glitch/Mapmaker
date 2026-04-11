import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapCanvas, type MapCanvasHandle } from './components/Canvas';
import { StatusBar } from './components/StatusBar';
import { useGenerator } from './hooks/useGenerator';
import { useLore } from './hooks/useLore';
import { useAssets } from './hooks/useAssets';
import { useZoom } from './hooks/useZoom';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { setWorldMapZoom } from './engine/generators/worldmap';
import { exportCanvasAsPNG } from './utils';
import type { ActivePanel } from './components/Sidebar/TabBar';

export default function App() {
  const {
    generators,
    activeGenerator,
    config,
    status,
    isGenerating,
    switchGenerator,
    generate,
    randomize,
    updateConfig,
  } = useGenerator();

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

  // Current view state (zoom/pan) reported from MapCanvas so we can
  // show it in the StatusBar and wire up the reset button
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const handleViewChange = useCallback((v: typeof view) => setView(v), []);
  const handleResetView = useCallback(() => {
    mapCanvasRef.current?.resetView();
  }, []);

  // Pass the zoom controller to the worldmap generator once on mount
  useEffect(() => {
    setWorldMapZoom(zoom.controller);
  }, [zoom.controller]);

  // When the zoom level changes to 'city', auto-switch to the city
  // generator using the clicked city's data. Going back to 'world'
  // switches back to the world generator.
  useEffect(() => {
    if (zoom.level === 'city' && zoom.data) {
      const cityGen = generators.find(g => g.id === 'citymap');
      if (cityGen && activeGenerator?.id !== 'citymap') {
        switchGenerator('citymap');
      }
      // Override seed and city name via config if available
      if (zoom.data.seed !== undefined) {
        updateConfig('seed', zoom.data.seed);
      }
      if (zoom.data.id) {
        updateConfig('loreCityId', zoom.data.id);
      }
    } else if (zoom.level === 'world' && activeGenerator?.id !== 'worldmap') {
      switchGenerator('worldmap');
    }
  }, [zoom.level, zoom.data, generators, activeGenerator, switchGenerator, updateConfig]);

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

  // Auto-regenerate when config changes - but debounced by 180ms so
  // dragging a slider doesn't trigger a render on every intermediate
  // value. The rendered config lags the visible control state by one
  // quiet frame, which is barely perceptible but saves 10-20 redundant
  // full generates per slider drag.
  const debouncedConfig = useDebouncedValue(config, 180);
  useEffect(() => {
    if (canvasRef.current && activeGenerator) {
      generate(canvasRef.current);
    }
  }, [debouncedConfig]);

  // Battle-map token placement needs interaction handlers attached to
  // the canvas. setupInteraction returns a cleanup that must run when
  // the user switches to a different generator so the listeners don't
  // leak and fire on the wrong map.
  useEffect(() => {
    if (!canvasRef.current || !activeGenerator) return;
    const inst = activeGenerator.instance as any;
    if (activeGenerator.id === 'battlemap' && typeof inst.setupInteraction === 'function') {
      const cleanup = inst.setupInteraction(canvasRef.current, () => {
        if (canvasRef.current) generate(canvasRef.current);
      });
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
    return undefined;
  }, [activeGenerator, generate]);

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
          // Zoom out one level (city -> region -> world). Works only
          // if the user is currently zoomed in.
          if (zoom.isZoomed) {
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
  }, [handleRandomize, handleGenerate, handleExport, zoom]);

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
      />

      <main className="main-content">
        <MapCanvas
          ref={mapCanvasRef}
          onCanvasReady={handleCanvasReady}
          width={config.width as number}
          height={config.height as number}
          onViewChange={handleViewChange}
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
