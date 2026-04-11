import type { GeneratorEntry } from '../../engine/types';

export type ActivePanel = 'generator' | 'lore' | 'assets';

interface TabBarProps {
  generators: GeneratorEntry[];
  activeId: string | null;
  activePanel: ActivePanel;
  onSelectGenerator: (id: string) => void;
  onSelectLore: () => void;
  onSelectAssets: () => void;
}

export function TabBar({
  generators,
  activeId,
  activePanel,
  onSelectGenerator,
  onSelectLore,
  onSelectAssets,
}: TabBarProps) {
  return (
    <nav className="tab-bar">
      {generators.map(gen => (
        <button
          key={gen.id}
          className={`tab-btn ${activePanel === 'generator' && activeId === gen.id ? 'active' : ''}`}
          onClick={() => onSelectGenerator(gen.id)}
        >
          <span className="tab-icon">{gen.icon}</span> {gen.label}
        </button>
      ))}
      <button
        className={`tab-btn ${activePanel === 'lore' ? 'active' : ''}`}
        onClick={onSelectLore}
      >
        <span className="tab-icon">📖</span> Lore
      </button>
      <button
        className={`tab-btn ${activePanel === 'assets' ? 'active' : ''}`}
        onClick={onSelectAssets}
      >
        <span className="tab-icon">📦</span> Assets
      </button>
    </nav>
  );
}
