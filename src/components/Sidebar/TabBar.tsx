import type { GeneratorEntry } from '../../engine/types';

export type ActivePanel = 'generator' | 'lore' | 'assets' | 'place' | 'admin';

interface TabBarProps {
  generators: GeneratorEntry[];
  activeId: string | null;
  activePanel: ActivePanel;
  onSelectGenerator: (id: string) => void;
  onSelectLore: () => void;
  onSelectAssets: () => void;
  onSelectPlace: () => void;
  onSelectAdmin: () => void;
}

// Short labels so all tabs fit in a 320px sidebar without wrapping weirdly
const SHORT_LABEL: Record<string, string> = {
  worldmap: 'Welt',
  citymap: 'Stadt',
  battlemap: 'Kampf',
};

export function TabBar({
  generators,
  activeId,
  activePanel,
  onSelectGenerator,
  onSelectLore,
  onSelectAssets,
  onSelectPlace,
  onSelectAdmin,
}: TabBarProps) {
  return (
    <nav className="tab-bar">
      {/* Row 1: map-type tabs */}
      <div className="tab-row">
        {generators.map(gen => (
          <button
            key={gen.id}
            className={`tab-btn ${activePanel === 'generator' && activeId === gen.id ? 'active' : ''}`}
            onClick={() => onSelectGenerator(gen.id)}
            title={gen.label}
          >
            <span className="tab-icon">{gen.icon}</span>
            <span className="tab-label">{SHORT_LABEL[gen.id] ?? gen.label}</span>
          </button>
        ))}
      </div>
      {/* Row 2: data tabs (lore, assets) */}
      <div className="tab-row tab-row-data">
        <button
          className={`tab-btn ${activePanel === 'lore' ? 'active' : ''}`}
          onClick={onSelectLore}
          title="Lore"
        >
          <span className="tab-icon">📖</span>
          <span className="tab-label">Lore</span>
        </button>
        <button
          className={`tab-btn ${activePanel === 'assets' ? 'active' : ''}`}
          onClick={onSelectAssets}
          title="Assets"
        >
          <span className="tab-icon">📦</span>
          <span className="tab-label">Assets</span>
        </button>
        <button
          className={`tab-btn ${activePanel === 'place' ? 'active' : ''}`}
          onClick={onSelectPlace}
          title="Assets platzieren & Karte speichern"
        >
          <span className="tab-icon">🎯</span>
          <span className="tab-label">Platzieren</span>
        </button>
        <button
          className={`tab-btn ${activePanel === 'admin' ? 'active' : ''}`}
          onClick={onSelectAdmin}
          title="Story-Editor (Admin)"
        >
          <span className="tab-icon">🔧</span>
          <span className="tab-label">Editor</span>
        </button>
      </div>
    </nav>
  );
}
