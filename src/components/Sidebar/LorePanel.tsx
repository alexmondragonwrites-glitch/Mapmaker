import { useCallback, useState } from 'react';
import type { LoreData } from '../../engine/types';

interface LorePanelProps {
  lore: LoreData;
  hasLore: boolean;
  onImport: (file: File) => Promise<{ success: boolean; message: string }>;
  onExport: () => void;
  onClear: () => void;
  getStats: () => Record<string, number>;
}

export function LorePanel({ lore, hasLore, onImport, onExport, onClear, getStats }: LorePanelProps) {
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const stats = getStats();

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      const result = await onImport(e.dataTransfer.files[0]);
      setStatusMsg(result.message);
      setStatusType(result.success ? 'success' : 'error');
    }
  }, [onImport]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const result = await onImport(e.target.files[0]);
      setStatusMsg(result.message);
      setStatusType(result.success ? 'success' : 'error');
    }
  }, [onImport]);

  return (
    <div className="lore-panel">
      {/* Import/Export */}
      <section className="lore-section">
        <h3 className="lore-section-title">Import / Export</h3>

        <div
          className="lore-upload-area"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => document.getElementById('lore-file-input')?.click()}
        >
          <div className="upload-icon">📁</div>
          <div className="upload-text">JSON-Datei hierher ziehen<br />oder klicken</div>
          <input
            type="file"
            accept=".json"
            className="upload-input"
            id="lore-file-input"
            onChange={handleFileSelect}
          />
        </div>

        <div className="lore-btn-row">
          <button className="btn" onClick={onExport}>JSON exportieren</button>
          <button className="btn btn-danger-small" onClick={() => {
            if (confirm('Alle Lore-Daten loeschen?')) onClear();
          }}>
            Alles loeschen
          </button>
        </div>

        {statusMsg && (
          <div className={`lore-status ${statusType}`}>{statusMsg}</div>
        )}
      </section>

      {/* Stats */}
      <section className="lore-section">
        <h3 className="lore-section-title">Uebersicht</h3>
        <div className="lore-stats">
          {Object.entries(stats).map(([key, val]) => (
            <div key={key} className="stat">
              <span className="stat-num">{val}</span>
              <span className="stat-label">{key}</span>
            </div>
          ))}
        </div>
      </section>

      {/* World Name */}
      <section className="lore-section">
        <h3 className="lore-section-title">Welt</h3>
        <div className="lore-info">
          <strong>{lore.name || 'Unbenannt'}</strong>
          {lore.description && <p>{lore.description}</p>}
        </div>
      </section>

      {/* Quick summary of entities */}
      {hasLore && (
        <>
          {lore.regions.length > 0 && (
            <section className="lore-section">
              <h3 className="lore-section-title">Regionen ({lore.regions.length})</h3>
              <div className="lore-list">
                {lore.regions.map(r => (
                  <div key={r.id} className="lore-card">
                    <div className="lore-card-header">
                      <span className="lore-card-name">{r.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {lore.cities.length > 0 && (
            <section className="lore-section">
              <h3 className="lore-section-title">Staedte ({lore.cities.length})</h3>
              <div className="lore-list">
                {lore.cities.map(c => (
                  <div key={c.id} className="lore-card">
                    <div className="lore-card-header">
                      <span className="lore-card-name">{c.name}</span>
                      <span className="lore-card-badge">{c.size || 'town'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {lore.npcs.length > 0 && (
            <section className="lore-section">
              <h3 className="lore-section-title">NPCs ({lore.npcs.length})</h3>
              <div className="lore-list">
                {lore.npcs.map(n => (
                  <div key={n.id} className="lore-card">
                    <div className="lore-card-header">
                      <span className="lore-card-name">{n.name}</span>
                      {n.role && <span className="lore-card-badge">{n.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
