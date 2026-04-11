import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Hierarchical zoom state: world -> region -> city.
 *
 * Separate from the view-level pan/zoom in MapCanvas. This hook tracks
 * the "logical" location the user is currently exploring (a world, a
 * region, or a specific city) and exposes click-to-zoom via clickable
 * areas that the world map generator registers on each render.
 */

export type ZoomLevel = 'world' | 'region' | 'city';

export interface ZoomTargetData {
    id?: string | null;
    name: string;
    seed?: number;
    size?: string;
    style?: string;
    isCapital?: boolean;
}

export interface ClickableArea {
    shape: 'circle' | 'rect';
    x: number;
    y: number;
    radius?: number;
    width?: number;
    height?: number;
    label: string;
    targetLevel: ZoomLevel;
    targetData: ZoomTargetData;
    showIndicator?: boolean;
}

export interface ZoomStackEntry {
    level: ZoomLevel;
    data: ZoomTargetData | null;
}

export interface Breadcrumb {
    label: string;
    level: ZoomLevel;
    data: ZoomTargetData | null;
}

export interface ZoomController {
    clearClickableAreas(): void;
    registerClickableArea(area: ClickableArea): void;
    renderBreadcrumbs(ctx: CanvasRenderingContext2D, canvasWidth: number): void;
    // Internal getter used by the click handler
    _areas: ClickableArea[];
}

export interface UseZoomResult {
    // State
    level: ZoomLevel;
    data: ZoomTargetData | null;
    stack: ZoomStackEntry[];
    breadcrumbs: Breadcrumb[];
    isZoomed: boolean;
    // Controller passed into generators via setWorldMapZoom
    controller: ZoomController;
    // Actions
    zoomIn: (level: ZoomLevel, data: ZoomTargetData) => void;
    zoomOut: () => void;
    jumpTo: (index: number) => void;
    reset: () => void;
    // Canvas binding - call once from App with the canvas element
    bindCanvas: (canvas: HTMLCanvasElement | null) => void;
}

function buildBreadcrumbs(
    stack: ZoomStackEntry[],
    currentLevel: ZoomLevel,
    currentData: ZoomTargetData | null,
): Breadcrumb[] {
    const crumbs: Breadcrumb[] = [{ label: 'Welt', level: 'world', data: null }];
    for (const entry of stack) {
        crumbs.push({
            label: entry.data?.name ?? entry.level,
            level: entry.level,
            data: entry.data,
        });
    }
    const levelLabel = (l: ZoomLevel) =>
        l === 'world' ? 'Welt' : l === 'region' ? 'Region' : 'Stadt';
    crumbs.push({
        label: currentData?.name ?? levelLabel(currentLevel),
        level: currentLevel,
        data: currentData,
    });
    // Remove duplicate "Welt" at world level
    if (crumbs.length === 2 && currentLevel === 'world') {
        return [crumbs[0]];
    }
    return crumbs;
}

export function useZoom(): UseZoomResult {
    const [level, setLevel] = useState<ZoomLevel>('world');
    const [data, setData] = useState<ZoomTargetData | null>(null);
    const [stack, setStack] = useState<ZoomStackEntry[]>([]);

    // Clickable areas are kept in a ref because the generator writes
    // them during its synchronous render pass, and we don't want a
    // re-render storm for every registered city
    const areasRef = useRef<ClickableArea[]>([]);
    // Canvas reference for the click handler
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Mouse position cache for hover effects (not yet used in this pkg)
    const mouseRef = useRef({ x: -1, y: -1 });

    // ── Controller object passed to the generator ─────────────────
    const controller: ZoomController = {
        _areas: areasRef.current,
        clearClickableAreas() {
            areasRef.current = [];
            (this as any)._areas = areasRef.current;
        },
        registerClickableArea(area: ClickableArea) {
            areasRef.current.push(area);
        },
        renderBreadcrumbs(ctx: CanvasRenderingContext2D, _canvasWidth: number) {
            // The generator still calls this; we render breadcrumbs to
            // the canvas so they survive export-as-png
            const crumbs = buildBreadcrumbs(stack, level, data);
            if (crumbs.length <= 1) return;

            ctx.save();
            ctx.font = '12px "Palatino Linotype", serif';
            ctx.textBaseline = 'middle';

            // Measure total width
            let total = 0;
            for (let i = 0; i < crumbs.length; i++) {
                total += ctx.measureText(crumbs[i].label).width;
                if (i < crumbs.length - 1) total += ctx.measureText(' → ').width;
            }

            const padding = 8;
            const y = 8;
            const h = 24;
            ctx.fillStyle = 'rgba(26, 20, 18, 0.85)';
            ctx.fillRect(0, 0, total + padding * 2 + 10, h + y * 2);
            ctx.strokeStyle = 'rgba(196, 135, 58, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, total + padding * 2 + 10, h + y * 2);

            let x = padding;
            for (let i = 0; i < crumbs.length; i++) {
                const isLast = i === crumbs.length - 1;
                ctx.font = isLast
                    ? 'bold 12px "Palatino Linotype", serif'
                    : '12px "Palatino Linotype", serif';
                ctx.fillStyle = isLast ? '#c4873a' : '#9a8a7a';
                ctx.fillText(crumbs[i].label, x, y + h / 2);
                x += ctx.measureText(crumbs[i].label).width;
                if (!isLast) {
                    ctx.fillStyle = '#5a4a3a';
                    ctx.fillText(' → ', x, y + h / 2);
                    x += ctx.measureText(' → ').width;
                }
            }

            ctx.restore();
        },
    };

    // ── Actions ────────────────────────────────────────────────────

    const zoomIn = useCallback((nextLevel: ZoomLevel, nextData: ZoomTargetData) => {
        setStack(s => [...s, { level, data }]);
        setLevel(nextLevel);
        setData(nextData);
    }, [level, data]);

    const zoomOut = useCallback(() => {
        setStack(s => {
            if (s.length === 0) return s;
            const prev = s[s.length - 1];
            setLevel(prev.level);
            setData(prev.data);
            return s.slice(0, -1);
        });
    }, []);

    const reset = useCallback(() => {
        setStack([]);
        setLevel('world');
        setData(null);
    }, []);

    const jumpTo = useCallback((index: number) => {
        setStack(s => {
            if (index === 0) {
                setLevel('world');
                setData(null);
                return [];
            }
            const newStack = s.slice(0, index);
            const target = s[index];
            setLevel(target.level);
            setData(target.data);
            return newStack;
        });
    }, []);

    // ── Canvas click binding ──────────────────────────────────────

    const bindCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
        canvasRef.current = canvas;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const isPointInArea = (px: number, py: number, area: ClickableArea) => {
            if (area.shape === 'circle') {
                const dx = px - area.x;
                const dy = py - area.y;
                return dx * dx + dy * dy <= (area.radius ?? 0) ** 2;
            }
            return (
                px >= area.x &&
                px <= area.x + (area.width ?? 0) &&
                py >= area.y &&
                py <= area.y + (area.height ?? 0)
            );
        };

        // Convert a DOM event to canvas-internal coordinates.
        // The canvas element may be transformed via CSS (pan/zoom from
        // MapCanvas). getBoundingClientRect() returns the on-screen box
        // after transforms, so dividing by its dimensions gives the
        // correct internal-pixel coordinates regardless of zoom.
        const toCanvasCoords = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
            };
        };

        // rAF-throttle the hit test + cursor update so that bursts of
        // mousemove events (which can fire 100+ times per second on
        // high-refresh mice) collapse into at most one update per
        // frame. Also cache the last cursor value so we only poke
        // `style.cursor` when it actually changes — every assignment
        // triggers a style recalculation even when the value is the
        // same, which is noticeable when hovering over a worldmap
        // with many clickable city areas.
        let pendingFrame: number | null = null;
        let pendingEvent: { x: number; y: number } | null = null;
        let lastCursor = '';
        const setCursor = (value: string) => {
            if (lastCursor === value) return;
            lastCursor = value;
            canvas.style.cursor = value;
        };

        const runHitTest = () => {
            pendingFrame = null;
            const pt = pendingEvent;
            pendingEvent = null;
            if (!pt) return;
            mouseRef.current = { x: pt.x, y: pt.y };
            if (areasRef.current.length === 0) {
                setCursor('');
                return;
            }
            let over = false;
            for (const area of areasRef.current) {
                if (isPointInArea(pt.x, pt.y, area)) {
                    over = true;
                    break;
                }
            }
            setCursor(over ? 'pointer' : '');
        };

        const handleMove = (e: MouseEvent) => {
            // Cheap fast path: no clickable areas means there's
            // nothing to hit-test and no cursor state to maintain.
            if (areasRef.current.length === 0) {
                setCursor('');
                return;
            }
            pendingEvent = toCanvasCoords(e);
            if (pendingFrame !== null) return;
            pendingFrame = requestAnimationFrame(runHitTest);
        };

        const handleClick = (e: MouseEvent) => {
            if (areasRef.current.length === 0) return;
            const { x, y } = toCanvasCoords(e);
            for (const area of areasRef.current) {
                if (isPointInArea(x, y, area)) {
                    e.stopPropagation();
                    zoomIn(area.targetLevel, area.targetData);
                    return;
                }
            }
        };

        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('click', handleClick);
        return () => {
            canvas.removeEventListener('mousemove', handleMove);
            canvas.removeEventListener('click', handleClick);
            if (pendingFrame !== null) {
                cancelAnimationFrame(pendingFrame);
                pendingFrame = null;
            }
        };
    }, [zoomIn]);

    const breadcrumbs = buildBreadcrumbs(stack, level, data);

    return {
        level,
        data,
        stack,
        breadcrumbs,
        isZoomed: stack.length > 0,
        controller,
        zoomIn,
        zoomOut,
        jumpTo,
        reset,
        bindCanvas,
    };
}
