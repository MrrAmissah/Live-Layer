import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEditTarget } from '../../hooks/useEditTarget';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../types/layout';

type LayoutKey = keyof Required<LayoutSettings>;

const GROUPS: Array<{
  key: LayoutKey;
  label: string;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
}> = [
  {
    key: 'size',
    label: 'Size',
    options: [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' }
    ]
  },
  {
    key: 'position',
    label: 'Position',
    options: [
      { value: 'left', label: 'Left', icon: AlignLeft },
      { value: 'center', label: 'Center', icon: AlignCenter },
      { value: 'full', label: 'Full', icon: AlignRight }
    ]
  },
  {
    key: 'density',
    label: 'Density',
    options: [
      { value: 'compact', label: 'Compact' },
      { value: 'standard', label: 'Standard' },
      { value: 'bold', label: 'Bold' }
    ]
  },
  {
    key: 'safeMargin',
    label: 'Safe margin',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'tight', label: 'Tight' }
    ]
  }
];

export default function LayoutControls() {
  const { layout, setLayout, resetLayout } = useEditTarget();

  return (
    <div className="layout-controls">
      {GROUPS.map((group) => {
        const value = layout[group.key] ?? DEFAULT_LAYOUT_SETTINGS[group.key];
        return (
          <div className="layout-group" key={group.key}>
            <div className="field__label">
              <span>{group.label}</span>
            </div>
            <div className="layout-seg" role="group" aria-label={group.label}>
              {group.options.map((option) => {
                const Icon = 'icon' in option ? option.icon : null;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`layout-seg__btn ${value === option.value ? 'layout-seg__btn--active' : ''}`}
                    onClick={() => setLayout({ [group.key]: option.value } as Partial<LayoutSettings>)}
                  >
                    {Icon ? <Icon size={17} aria-hidden /> : null}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <button type="button" className="step-link" onClick={resetLayout}>
        Reset layout
      </button>
    </div>
  );
}
