import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapCanvas } from './components/Canvas';
import { StatusBar } from './components/StatusBar';
import { useGenerator } from './hooks/useGenerator';
import { useLore } from './hooks/useLore';
import { useAssets } from './hooks/useAssets';
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
  } = useAssets();

  const [activePanel, setActivePanel] = useState<ActivePanel>('generator');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    generate(canvas);
  }, [generate]);

  // Auto-regenerate when config changes
  useEffect(() => {
    if (canvasRef.current && activeGenerator) {
      generate(canvasRef.current);
    }
  }, [config]);

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
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleRandomize, handleGenerate, handleExport]);

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
      />

      <main className="main-content">
        <MapCanvas
          onCanvasReady={handleCanvasReady}
          width={config.width as number}
          height={config.height as number}
        />
        <StatusBar status={status} isGenerating={isGenerating} />
      </main>
    </div>
  );
}
