import { useState, useCallback, useRef, useEffect } from 'react';
import { GeneratorRegistry, WorldMapGenerator, CityMapGenerator, BattleMapGenerator } from '../engine';
import type { GeneratorEntry, GeneratorConfig } from '../engine';

export function useGenerator() {
  const registryRef = useRef<GeneratorRegistry | null>(null);
  const [activeGenerator, setActiveGenerator] = useState<GeneratorEntry | null>(null);
  const [config, setConfig] = useState<GeneratorConfig>({ seed: 0, width: 1200, height: 800 });
  const [generators, setGenerators] = useState<GeneratorEntry[]>([]);
  const [status, setStatus] = useState('Bereit');
  const [isGenerating, setIsGenerating] = useState(false);

  // Initialize registry once
  useEffect(() => {
    const registry = new GeneratorRegistry();
    registry.register(WorldMapGenerator as any);
    registry.register(CityMapGenerator as any);
    registry.register(BattleMapGenerator as any);
    registryRef.current = registry;

    const all = registry.getAll();
    setGenerators(all);

    // Activate first generator
    if (all.length > 0) {
      setActiveGenerator(all[0]);
      setConfig({ ...all[0].instance.defaultConfig });
    }
  }, []);

  const switchGenerator = useCallback((id: string) => {
    const gen = registryRef.current?.get(id);
    if (!gen) return;
    setActiveGenerator(gen);
    setConfig({ ...gen.instance.defaultConfig });
  }, []);

  const generate = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !activeGenerator || isGenerating) return;

    setIsGenerating(true);
    setStatus('Generiere Karte...');

    requestAnimationFrame(() => {
      try {
        activeGenerator.instance.generate(canvas, config);
        setStatus(`${activeGenerator.label} generiert (${canvas.width}×${canvas.height}px)`);
      } catch (err: any) {
        setStatus(`Fehler: ${err.message}`);
        console.error('Generation error:', err);
      }
      setIsGenerating(false);
    });
  }, [activeGenerator, config, isGenerating]);

  const randomize = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 100000);
    setConfig(prev => ({ ...prev, seed: newSeed }));
  }, []);

  const updateConfig = useCallback((key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    generators,
    activeGenerator,
    config,
    status,
    isGenerating,
    switchGenerator,
    generate,
    randomize,
    updateConfig,
  };
}
