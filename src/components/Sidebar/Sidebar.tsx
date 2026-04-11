import { TabBar, type ActivePanel } from './TabBar';
import { Controls } from './Controls';
import { LorePanel } from './LorePanel';
import { AssetPanel } from './AssetPanel';
import { ActionBar } from './ActionBar';
import type { GeneratorEntry, GeneratorConfig, LoreData } from '../../engine/types';
import type { PackRecord } from '../../engine/assets-runtime';
import type { AssetSummary } from '../../hooks/useAssets';

interface SidebarProps {
  generators: GeneratorEntry[];
  activeGenerator: GeneratorEntry | null;
  config: GeneratorConfig;
  activePanel: ActivePanel;
  // Lore
  lore: LoreData;
  hasLore: boolean;
  onLoreImport: (file: File) => Promise<{ success: boolean; message: string }>;
  onLoreExport: () => void;
  onLoreClear: () => void;
  getLoreStats: () => Record<string, number>;
  // Assets
  assetPacks: PackRecord[];
  assetSummary: AssetSummary;
  assetsLoading: boolean;
  assetsError: string | null;
  lastAssetImportMessage: string | null;
  lastAssetSkipCounts: Record<string, number> | null;
  onAssetsImport: (files: File[]) => Promise<void>;
  onAssetsTogglePack: (id: string, enabled: boolean) => Promise<void>;
  onAssetsDeletePack: (id: string) => Promise<void>;
  // Navigation
  onSelectGenerator: (id: string) => void;
  onSelectLore: () => void;
  onSelectAssets: () => void;
  onUpdateConfig: (key: string, value: unknown) => void;
  onGenerate: () => void;
  onRandomize: () => void;
  onExport: () => void;
}

const HEADERS: Record<ActivePanel, string> = {
  generator: 'Einstellungen',
  lore: 'Lore-Verwaltung',
  assets: 'Asset-Packs',
};

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
        onSelectAssets={props.onSelectAssets}
      />

      <div className="controls-header">{HEADERS[props.activePanel]}</div>

      <div className="controls-scroll">
        {props.activePanel === 'lore' && (
          <LorePanel
            lore={props.lore}
            hasLore={props.hasLore}
            onImport={props.onLoreImport}
            onExport={props.onLoreExport}
            onClear={props.onLoreClear}
            getStats={props.getLoreStats}
          />
        )}
        {props.activePanel === 'assets' && (
          <AssetPanel
            packs={props.assetPacks}
            summary={props.assetSummary}
            loading={props.assetsLoading}
            error={props.assetsError}
            lastImportMessage={props.lastAssetImportMessage}
            lastSkipCounts={props.lastAssetSkipCounts}
            onImport={props.onAssetsImport}
            onTogglePack={props.onAssetsTogglePack}
            onDeletePack={props.onAssetsDeletePack}
          />
        )}
        {props.activePanel === 'generator' && props.activeGenerator && (
          <Controls
            controls={props.activeGenerator.controls}
            config={props.config}
            onUpdate={props.onUpdateConfig}
          />
        )}
      </div>

      <ActionBar
        onGenerate={props.onGenerate}
        onRandomize={props.onRandomize}
        onExport={props.onExport}
      />
    </aside>
  );
}
