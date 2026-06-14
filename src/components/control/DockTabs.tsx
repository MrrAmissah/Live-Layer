export type DockTab = 'templates' | 'edit' | 'live' | 'brand' | 'library';

interface DockTabsProps {
  active: DockTab;
  onChange: (tab: DockTab) => void;
}

/** Main workflow steps, then the two secondary tabs after a divider. */
const PRIMARY: { id: DockTab; label: string; step: string }[] = [
  { id: 'templates', label: 'Graphic', step: '1' },
  { id: 'edit', label: 'Edit', step: '2' },
  { id: 'live', label: 'Live', step: '3' }
];

const SECONDARY: { id: DockTab; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'library', label: 'Library' }
];

/**
 * Dock tab bar. The three workflow steps (Graphic → Edit → Live) read as a
 * numbered path; Brand and Library sit after a divider, visually quieter, so a
 * beginner's eye follows the main flow first.
 */
export default function DockTabs({ active, onChange }: DockTabsProps) {
  return (
    <nav className="dock-tabs" aria-label="Workflow">
      {PRIMARY.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`dock-tab dock-tab--step ${active === tab.id ? 'dock-tab--active' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span className="dock-tab__step" aria-hidden>{tab.step}</span>
          {tab.label}
        </button>
      ))}
      <span className="dock-tabs__divider" aria-hidden />
      {SECONDARY.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`dock-tab dock-tab--secondary ${active === tab.id ? 'dock-tab--active' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
