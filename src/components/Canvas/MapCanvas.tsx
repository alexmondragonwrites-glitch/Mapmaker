import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';

interface MapCanvasProps {
    onCanvasReady: (canvas: HTMLCanvasElement) => void;
    width?: number;
    height?: number;
    /** Called when the user changes zoom/pan so the StatusBar can display it. */
    onViewChange?: (view: { zoom: number; panX: number; panY: number }) => void;
}

export interface MapCanvasHandle {
    /** Reset zoom to 1 and pan to (0, 0). */
    resetView: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
    { onCanvasReady, width = 1200, height = 800, onViewChange },
    ref,
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // View state: CSS transform applied to the canvas element
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);

    // Drag state tracked in refs so rerenders don't reset mid-drag
    const dragStateRef = useRef<{
        dragging: boolean;
        startX: number;
        startY: number;
        startPanX: number;
        startPanY: number;
        pointerId: number;
    } | null>(null);

    // Notify parent whenever the view changes
    useEffect(() => {
        onViewChange?.({ zoom, panX, panY });
    }, [zoom, panX, panY, onViewChange]);

    useEffect(() => {
        if (canvasRef.current) {
            onCanvasReady(canvasRef.current);
        }
    }, [onCanvasReady]);

    // Reset zoom/pan when the canvas dimensions change so a newly
    // generated map of a different size lands centered
    useEffect(() => {
        setZoom(1);
        setPanX(0);
        setPanY(0);
    }, [width, height]);

    // ── Mouse wheel zoom ────────────────────────────────────────────
    //
    // Zoom is applied around the mouse position: the world point under
    // the cursor stays under the cursor across the zoom change.
    const handleWheel = useCallback((e: RWheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!wrapperRef.current) return;

        const rect = wrapperRef.current.getBoundingClientRect();
        // Cursor position relative to the wrapper
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // Zoom factor per wheel tick. deltaY > 0 = scroll down = zoom out
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
        if (nextZoom === zoom) return;

        // Keep the world point under the cursor stable.
        // Before zoom: worldX = (cx - panX - rect.w/2) / zoom
        // After zoom we want: (cx - newPanX - rect.w/2) / nextZoom === worldX
        // => newPanX = cx - rect.w/2 - worldX * nextZoom
        const worldX = (cx - panX - rect.width / 2) / zoom;
        const worldY = (cy - panY - rect.height / 2) / zoom;
        const newPanX = cx - rect.width / 2 - worldX * nextZoom;
        const newPanY = cy - rect.height / 2 - worldY * nextZoom;

        setZoom(nextZoom);
        setPanX(newPanX);
        setPanY(newPanY);
    }, [zoom, panX, panY]);

    // ── Drag to pan (left mouse / touch) ────────────────────────────

    const handlePointerDown = useCallback((e: RPointerEvent<HTMLDivElement>) => {
        // Only left button (or touch, where button === 0 too)
        if (e.button !== 0) return;
        // Don't start a drag on the canvas element itself if another
        // handler (e.g. battle map token placement) is going to claim
        // the click. We let the event bubble so child handlers run first.

        dragStateRef.current = {
            dragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPanX: panX,
            startPanY: panY,
            pointerId: e.pointerId,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, [panX, panY]);

    const handlePointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        if (!state?.dragging || state.pointerId !== e.pointerId) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        // Only start dragging after a small threshold so tiny clicks still
        // pass through to the canvas click handlers
        if (Math.hypot(dx, dy) < 3) return;

        setPanX(state.startPanX + dx);
        setPanY(state.startPanY + dy);
    }, []);

    const handlePointerUp = useCallback((e: RPointerEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        if (!state) return;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(state.pointerId);
        } catch { /* ignore */ }
        dragStateRef.current = null;
    }, []);

    // ── Double click to reset ───────────────────────────────────────

    const handleDoubleClick = useCallback(() => {
        setZoom(1);
        setPanX(0);
        setPanY(0);
    }, []);

    // Expose resetView to parent via ref so StatusBar can drive it
    useImperativeHandle(ref, () => ({
        resetView: () => {
            setZoom(1);
            setPanX(0);
            setPanY(0);
        },
    }), []);

    // ── Keyboard zoom ───────────────────────────────────────────────

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement ||
                e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case '+':
                case '=':
                    e.preventDefault();
                    setZoom(z => Math.min(MAX_ZOOM, z * 1.2));
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    setZoom(z => Math.max(MIN_ZOOM, z / 1.2));
                    break;
                case '0':
                    e.preventDefault();
                    setZoom(1);
                    setPanX(0);
                    setPanY(0);
                    break;
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    return (
        <div
            ref={wrapperRef}
            className="canvas-container"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            style={{ touchAction: 'none' }}
        >
            <canvas
                ref={canvasRef}
                id="map-canvas"
                width={width}
                height={height}
                style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    // Disable browser image smoothing on aggressive zoom so
                    // the map stays crisp at high magnification
                    imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
                }}
            />
        </div>
    );
});
