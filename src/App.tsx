import { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapCanvas } from './components/Canvas';
import { StatusBar } from './components/StatusBar';
import { useGenerator } from './hooks/useGenerator';
import { useLore } from './hooks/useLore';
import { exportCanvasAsPNG } from './utils';

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

  const [activePanel, setActivePanel] = useState<'generator' | 'lore'>('generator');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
        onSelectGenerator={handleSelectGenerator}
        onSelectLore={() => setActivePanel('lore')}
        onUpdateConfig={updateConfig}
        onGenerate={handleGenerate}
        onRandomize={handleRandomize}
        onExport={handleExport}
        onLoreImport={importFile}
        onLoreExport={exportFile}
        onLoreClear={clearAll}
        getLoreStats={getStats}
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
