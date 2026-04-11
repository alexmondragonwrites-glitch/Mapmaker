import { useState, useCallback, useRef, useEffect } from 'react';
import { GeneratorRegistry, WorldMapGenerator, CityMapGenerator, BattleMapGenerator } from '../engine';
import type { GeneratorEntry, GeneratorConfig } from '../engine';

/**
 * Optional post-generate hook. Runs after the procedural generator
 * finishes but before the status is set to "done", so overlays like
 * placed assets can draw on top of the base map.
 */
export type AfterGenerateHook = (
    canvas: HTMLCanvasElement,
    generatorId: string,
    config: GeneratorConfig,
) => void;

export function useGenerator() {
  const registryRef = useRef<GeneratorRegistry | null>(null);
  const [activeGenerator, setActiveGenerator] = useState<GeneratorEntry | null>(null);
  const [config, setConfig] = useState<GeneratorConfig>({ seed: 0, width: 1200, height: 800 });
  const [generators, setGenerators] = useState<GeneratorEntry[]>([]);
  const [status, setStatus] = useState('Bereit');
  const [isGenerating, setIsGenerating] = useState(false);
  // Hook that runs after the procedural generator finishes. Held in
  // a ref so updating the hook from the caller doesn't invalidate
  // the memoized `generate` callback (which would retrigger the
  // debounced render effect on every hook update).
  const afterHookRef = useRef<AfterGenerateHook | null>(null);
  const setAfterGenerate = useCallback((hook: AfterGenerateHook | null) => {
    afterHookRef.current = hook;
  }, []);

  // Snapshot of the canvas taken right after the procedural generator
  // finishes but BEFORE the afterGenerate overlay hook runs. This lets
  // fast paths (placement add/remove, battle-map hover) redraw the
  // dynamic overlay layer without re-running the expensive base
  // generator. Stored as an offscreen HTMLCanvasElement so a single
  // drawImage call restores the full base in O(pixels).
  const baseSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderRef = useRef<{
    canvas: HTMLCanvasElement;
    generatorId: string;
    config: GeneratorConfig;
  } | null>(null);

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

        // Snapshot the base layer before the overlay hook runs so
        // placement changes and hover highlights can redraw without
        // re-running the procedural generator.
        let snapshot = baseSnapshotRef.current;
        if (
          !snapshot
          || snapshot.width !== canvas.width
          || snapshot.height !== canvas.height
        ) {
          snapshot = document.createElement('canvas');
          snapshot.width = canvas.width;
          snapshot.height = canvas.height;
          baseSnapshotRef.current = snapshot;
        }
        const snapshotCtx = snapshot.getContext('2d');
        if (snapshotCtx) {
          snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height);
          snapshotCtx.drawImage(canvas, 0, 0);
        }
        lastRenderRef.current = {
          canvas,
          generatorId: activeGenerator.id,
          config,
        };

        // Post-generate overlay (manual placed assets). Any error
        // here is logged but doesn't roll back the base render.
        try {
          afterHookRef.current?.(canvas, activeGenerator.id, config);
        } catch (hookErr) {
          console.error('afterGenerate hook failed:', hookErr);
        }
        setStatus(`${activeGenerator.label} generiert (${canvas.width}×${canvas.height}px)`);
      } catch (err: any) {
        setStatus(`Fehler: ${err.message}`);
        console.error('Generation error:', err);
      }
      setIsGenerating(false);
    });
  }, [activeGenerator, config, isGenerating]);

  /**
   * Cheap redraw: restores the last base snapshot and re-runs the
   * afterGenerate overlay hook. Use this when the only thing that
   * changed is the overlay layer (e.g. a placement was added, or a
   * battle-map hover cell moved) - it avoids re-running the expensive
   * procedural generator by reusing the already-rendered base.
   *
   * Falls back silently if no snapshot is available yet (first render
   * hasn't happened). Returns true when a redraw actually ran so
   * callers can decide whether to follow up with a full generate.
   */
  const rerenderOverlay = useCallback((): boolean => {
    const snapshot = baseSnapshotRef.current;
    const last = lastRenderRef.current;
    if (!snapshot || !last) return false;
    const ctx = last.canvas.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, last.canvas.width, last.canvas.height);
    ctx.drawImage(snapshot, 0, 0);
    try {
      afterHookRef.current?.(last.canvas, last.generatorId, last.config);
    } catch (hookErr) {
      console.error('afterGenerate hook failed:', hookErr);
    }
    return true;
  }, []);

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
    rerenderOverlay,
    randomize,
    updateConfig,
    setAfterGenerate,
  };
}
