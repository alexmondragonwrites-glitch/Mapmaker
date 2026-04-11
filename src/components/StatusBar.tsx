import type { Breadcrumb } from '../hooks/useZoom';

interface StatusBarProps {
  status: string;
  isGenerating: boolean;
  view?: { zoom: number; panX: number; panY: number };
  onResetView?: () => void;
  // Hierarchical zoom (city click-through)
  breadcrumbs?: Breadcrumb[];
  onBreadcrumbJump?: (index: number) => void;
  onZoomOut?: () => void;
  isZoomed?: boolean;
}

export function StatusBar({
  status,
  isGenerating,
  view,
  onResetView,
  breadcrumbs,
  onBreadcrumbJump,
  onZoomOut,
  isZoomed,
}: StatusBarProps) {
  // Show the breadcrumb strip only when the user has actually zoomed
  // into a region/city; otherwise the StatusBar shows the regular
  // status line + shortcuts.
  const showBreadcrumbs = isZoomed && breadcrumbs && breadcrumbs.length > 1;

  return (
    <div className="status-bar">
      {showBreadcrumbs && (
        <div className="status-breadcrumbs">
          {breadcrumbs!.map((crumb, i) => {
            const isLast = i === breadcrumbs!.length - 1;
            return (
              <span key={i} className="breadcrumb-chip-wrap">
                {isLast ? (
                  <span className="breadcrumb-chip active">{crumb.label}</span>
                ) : (
                  <button
                    type="button"
                    className="breadcrumb-chip"
                    onClick={() => onBreadcrumbJump?.(i)}
                  >
                    {crumb.label}
                  </button>
                )}
                {!isLast && <span className="breadcrumb-sep">›</span>}
              </span>
            );
          })}
          {onZoomOut && (
            <button type="button" className="btn btn-mini" onClick={onZoomOut} title="Zurueck (Esc)">
              ← Zurueck
            </button>
          )}
        </div>
      )}
      {!showBreadcrumbs && (
        <span className={`status-text ${isGenerating ? 'active' : ''}`}>{status}</span>
      )}

      <span className="status-right">
        {view && (
          <span className="view-indicator" title="Doppelklick auf Karte = Reset">
            <span className="view-label">Zoom</span>
            <span className="view-value">{Math.round(view.zoom * 100)}%</span>
            {(view.zoom !== 1 || view.panX !== 0 || view.panY !== 0) && onResetView && (
              <button
                type="button"
                className="btn btn-mini"
                onClick={onResetView}
                title="Ansicht zuruecksetzen (0)"
              >
                ⟳
              </button>
            )}
          </span>
        )}
        <span className="shortcuts">
          <kbd>R</kbd> Zufall &middot;
          <kbd>G</kbd> Generieren &middot;
          <kbd>Ctrl+E</kbd> Export &middot;
          <kbd>Esc</kbd> Zurueck
        </span>
      </span>
    </div>
  );
}
