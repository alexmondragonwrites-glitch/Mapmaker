interface StatusBarProps {
  status: string;
  isGenerating: boolean;
}

export function StatusBar({ status, isGenerating }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span className={`status-text ${isGenerating ? 'active' : ''}`}>{status}</span>
      <span className="shortcuts">
        <kbd>R</kbd> Zufall &middot;
        <kbd>G</kbd> Generieren &middot;
        <kbd>Ctrl+E</kbd> Export &middot;
        <kbd>Esc</kbd> Zurueck
      </span>
    </div>
  );
}
