import { useRef, useEffect, useCallback } from 'react';

interface MapCanvasProps {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  width?: number;
  height?: number;
}

export function MapCanvas({ onCanvasReady, width = 1200, height = 800 }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        id="map-canvas"
        width={width}
        height={height}
      />
    </div>
  );
}
