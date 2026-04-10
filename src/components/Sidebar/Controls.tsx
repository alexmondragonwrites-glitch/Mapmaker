import type { GeneratorControl, GeneratorConfig } from '../../engine/types';

interface ControlsProps {
  controls: GeneratorControl[];
  config: GeneratorConfig;
  onUpdate: (key: string, value: unknown) => void;
}

export function Controls({ controls, config, onUpdate }: ControlsProps) {
  return (
    <div className="controls-list">
      {controls.map(ctrl => {
        if (ctrl.type === 'custom') return null;
        return <ControlItem key={ctrl.key} control={ctrl} value={config[ctrl.key]} onUpdate={onUpdate} />;
      })}
    </div>
  );
}

function ControlItem({ control, value, onUpdate }: {
  control: GeneratorControl;
  value: unknown;
  onUpdate: (key: string, value: unknown) => void;
}) {
  switch (control.type) {
    case 'number':
      return (
        <div className="control-group">
          <label htmlFor={`ctrl-${control.key}`}>{control.label}</label>
          <input
            type="number"
            id={`ctrl-${control.key}`}
            min={control.min}
            max={control.max}
            value={value as number ?? 0}
            onChange={e => onUpdate(control.key, parseInt(e.target.value))}
          />
        </div>
      );

    case 'range':
      return (
        <div className="control-group">
          <label htmlFor={`ctrl-${control.key}`}>{control.label}</label>
          <div className="range-wrap">
            <input
              type="range"
              id={`ctrl-${control.key}`}
              min={control.min}
              max={control.max}
              step={control.step}
              value={value as number ?? 0}
              onChange={e => onUpdate(control.key, parseFloat(e.target.value))}
            />
            <span className="range-value">
              {Number.isInteger(value as number) ? String(value) : (value as number)?.toFixed?.(2) ?? '0'}
            </span>
          </div>
        </div>
      );

    case 'select':
      return (
        <div className="control-group">
          <label htmlFor={`ctrl-${control.key}`}>{control.label}</label>
          <select
            id={`ctrl-${control.key}`}
            value={String(value ?? '')}
            onChange={e => {
              const v = e.target.value;
              onUpdate(control.key, isNaN(Number(v)) ? v : parseFloat(v));
            }}
          >
            {control.options.map(opt => (
              <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
        </div>
      );

    case 'checkbox':
      return (
        <div className="control-group checkbox-group">
          <input
            type="checkbox"
            id={`ctrl-${control.key}`}
            checked={value as boolean ?? false}
            onChange={e => onUpdate(control.key, e.target.checked)}
          />
          <label htmlFor={`ctrl-${control.key}`}>{control.label}</label>
        </div>
      );

    default:
      return null;
  }
}
