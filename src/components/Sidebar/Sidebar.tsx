import { TabBar } from './TabBar';
import { Controls } from './Controls';
import { LorePanel } from './LorePanel';
import { ActionBar } from './ActionBar';
import type { GeneratorEntry, GeneratorConfig, LoreData } from '../../engine/types';

interface SidebarProps {
  generators: GeneratorEntry[];
  activeGenerator: GeneratorEntry | null;
  config: GeneratorConfig;
  activePanel: 'generator' | 'lore';
  lore: LoreData;
  hasLore: boolean;
  onSelectGenerator: (id: string) => void;
  onSelectLore: () => void;
  onUpdateConfig: (key: string, value: unknown) => void;
  onGenerate: () => void;
  onRandomize: () => void;
  onExport: () => void;
  onLoreImport: (file: File) => Promise<{ success: boolean; message: string }>;
  onLoreExport: () => void;
  onLoreClear: () => void;
  getLoreStats: () => Record<string, number>;
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="app-header">
        <div className="app-title">Calyndra Mapmaker</div>
        <div className="app-subtitle">Fantasy-Kartengenerator</div>
      </div>

      <TabBar
        generators={props.generators}
        activeId={props.activeGenerator?.id ?? null}
        activePanel={props.activePanel}
        onSelectGenerator={props.onSelectGenerator}
        onSelectLore={props.onSelectLore}
      />

      <div className="controls-header">
        {props.activePanel === 'lore' ? 'Lore-Verwaltung' : 'Einstellungen'}
      </div>

      <div className="controls-scroll">
        {props.activePanel === 'lore' ? (
          <LorePanel
            lore={props.lore}
            hasLore={props.hasLore}
            onImport={props.onLoreImport}
            onExport={props.onLoreExport}
            onClear={props.onLoreClear}
            getStats={props.getLoreStats}
          />
        ) : props.activeGenerator ? (
          <Controls
            controls={props.activeGenerator.controls}
            config={props.config}
            onUpdate={props.onUpdateConfig}
          />
        ) : null}
      </div>

      <ActionBar
        onGenerate={props.onGenerate}
        onRandomize={props.onRandomize}
        onExport={props.onExport}
      />
    </aside>
  );
}
