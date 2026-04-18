/**
 * Story Map Generator — chapter-based progressive world renderer.
 *
 * Unlike the procedural generators (worldmap, citymap, battlemap)
 * which create random maps from seeds, this generator renders a
 * SPECIFIC world from a JSON document. Locations, paths, buildings,
 * and characters are placed at authored positions. A chapter slider
 * controls visibility via minChapter/destroyedChapter gating.
 *
 * Two render modes:
 *   - World overview: shows the full map with location nodes, paths,
 *     fog of war, and chapter-gated features
 *   - Detail view: zooms into a specific location showing buildings,
 *     local paths, characters, and supernatural effects
 */

import type { StoryWorldData } from './types';
import { renderWorldOverview } from './world-renderer';
import { renderDetailMap } from './detail-renderer';

// Module-level state (same pattern as worldmap's _zoomController)
let _worldData: StoryWorldData | null = null;
let _zoomController: any = null;

export function setStoryMapData(data: StoryWorldData | null) {
    _worldData = data;
}

export function setStoryMapZoom(zoom: any) {
    _zoomController = zoom;
}

export class StoryMapGenerator {
    static id = 'storymap';
    static label = 'Erzählkarte';
    static icon = '📜';

    defaultConfig: Record<string, unknown>;

    constructor() {
        this.defaultConfig = {
            seed: 42,
            width: 1200,
            height: 780,          // ~1000:650 aspect ratio
            chapter: 1,            // P=0, chapters 1-7
            showPaths: true,
            showCharacters: true,
            showSupernatural: true,
            showLabels: true,
            useExploredArea: true,  // Only render terrain in explored area
            exploredRadius: 1,      // Multiplier for exploration radius
            _viewLevel: 'world',           // 'world' | 'detail'
            _detailLocationId: null as string | null,
        };
    }

    getControls() {
        return [
            {
                type: 'custom',
                key: 'chapter',
                label: 'Kapitel',
                renderer: 'chapterSlider',
                min: 0,
                max: _worldData?.maxChapter ?? 7,
            },
            {
                type: 'select', key: 'width', label: 'Breite',
                options: [
                    { value: 800, label: '800px' },
                    { value: 1200, label: '1200px' },
                    { value: 1920, label: '1920px (HD)' },
                ],
            },
            {
                type: 'select', key: 'height', label: 'Höhe',
                options: [
                    { value: 520, label: '520px' },
                    { value: 780, label: '780px' },
                    { value: 1248, label: '1248px (HD)' },
                ],
            },
            { type: 'checkbox', key: 'useExploredArea', label: 'Nur erforschter Bereich' },
            { type: 'range', key: 'exploredRadius', label: 'Radius erforscht', min: 0.5, max: 2.5, step: 0.1 },
            { type: 'checkbox', key: 'showPaths', label: 'Wege anzeigen' },
            { type: 'checkbox', key: 'showCharacters', label: 'Charaktere anzeigen' },
            { type: 'checkbox', key: 'showSupernatural', label: 'Übernatürliches anzeigen' },
            { type: 'checkbox', key: 'showLabels', label: 'Beschriftungen' },
        ];
    }

    generate(canvas: HTMLCanvasElement, config: Record<string, unknown> = {}) {
        const cfg = { ...this.defaultConfig, ...config };
        const width = cfg.width as number;
        const height = cfg.height as number;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d')!;
        const chapter = cfg.chapter as number;

        if (!_worldData) {
            // Data not loaded yet — show loading message
            ctx.fillStyle = '#1a1410';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#c4873a';
            ctx.font = '16px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.fillText('Welt-Daten werden geladen...', width / 2, height / 2);
            return;
        }

        const viewLevel = cfg._viewLevel as string;
        const detailLocationId = cfg._detailLocationId as string | null;

        if (viewLevel === 'detail' && detailLocationId) {
            renderDetailMap(ctx, cfg, _worldData, detailLocationId, chapter);
        } else {
            renderWorldOverview(ctx, cfg, _worldData, chapter, _zoomController);
        }
    }
}
