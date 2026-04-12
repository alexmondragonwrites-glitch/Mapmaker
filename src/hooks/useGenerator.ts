import { useState, useCallback, useRef, useEffect } from 'react';
import { GeneratorRegistry, WorldMapGenerator, CityMapGenerator, BattleMapGenerator, StoryMapGenerator } from '../engine';
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

  // Mirror state into refs so the public `generate` / `rerenderOverlay`
  // callbacks can have empty dependency arrays and stay referentially
  // stable across config and activeGenerator changes. Without this,
  // every slider tick invalidated `generate`, which propagated into
  // every useEffect and useCallback in App.tsx that listed `generate`
  // as a dep - including the MapCanvas onCanvasReady prop, which in
  // turn triggered a fresh generate() on every render via the
  // canvas-ready useEffect. With refs + stable callbacks that whole
  // chain collapses to "only the debounced config effect triggers a
  // regen".
  //
  // The refs are synced in a useEffect (rather than the render body)
  // to keep react-hooks/refs happy. That means during the very first
  // mount commit, the refs are still their initial values when
  // child-component effects fire - but no generate() call path relies
  // on them during that window: the initial map render is kicked off
  // by the debouncedConfig effect a few ms after the registry setup
  // effect installs the first activeGenerator.
  const activeGeneratorRef = useRef(activeGenerator);
  const configRef = useRef(config);
  // `isGenerating` is ALSO mirrored into a ref, but unlike the others
  // we also flip it synchronously at the top of `generate` so tight
  // callers (several effects firing in the same render commit) bail
  // out even before React has committed the setIsGenerating update.
  const isGeneratingRef = useRef(false);
  useEffect(() => {
    activeGeneratorRef.current = activeGenerator;
  }, [activeGenerator]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Initialize registry once
  useEffect(() => {
    const registry = new GeneratorRegistry();
    registry.register(WorldMapGenerator as any);
    registry.register(CityMapGenerator as any);
    registry.register(BattleMapGenerator as any);
    registry.register(StoryMapGenerator as any);
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
    const activeGen = activeGeneratorRef.current;
    const cfg = configRef.current;
    if (!canvas || !activeGen || isGeneratingRef.current) return;

    // Flip the guard synchronously so any subsequent generate() calls
    // in the same commit phase bail out, even though React hasn't
    // committed the setIsGenerating update yet.
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setStatus('Generiere Karte...');

    requestAnimationFrame(() => {
      try {
        activeGen.instance.generate(canvas, cfg);

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
          generatorId: activeGen.id,
          config: cfg,
        };

        // Post-generate overlay (manual placed assets). Any error
        // here is logged but doesn't roll back the base render.
        try {
          afterHookRef.current?.(canvas, activeGen.id, cfg);
        } catch (hookErr) {
          console.error('afterGenerate hook failed:', hookErr);
        }
        setStatus(`${activeGen.label} generiert (${canvas.width}×${canvas.height}px)`);
      } catch (err: any) {
        setStatus(`Fehler: ${err.message}`);
        console.error('Generation error:', err);
      }
      isGeneratingRef.current = false;
      setIsGenerating(false);
    });
  }, []);

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
