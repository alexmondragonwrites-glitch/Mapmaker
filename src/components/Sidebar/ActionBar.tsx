interface ActionBarProps {
  onGenerate: () => void;
  onRandomize: () => void;
  onExport: () => void;
}

export function ActionBar({ onGenerate, onRandomize, onExport }: ActionBarProps) {
  return (
    <div className="action-bar">
      <button className="btn btn-primary" onClick={onGenerate} title="Karte generieren (G)">
        Generieren
      </button>
      <button className="btn" onClick={onRandomize} title="Zufaelliger Seed (R)">
        Zufall
      </button>
      <button className="btn" onClick={onExport} title="Als PNG exportieren (Ctrl+E)">
        Export PNG
      </button>
    </div>
  );
}
