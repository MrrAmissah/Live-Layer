import { Icon, type IconName } from '../../lib/icons';

export type DockTab = 'live' | 'queue' | 'edit' | 'more';

/**
 * The tone split is SEMANTIC, not decorative: tabs that operate the output
 * (Live, Queue) carry the live-green indicator with the label kept white —
 * green never recolours text; configuration tabs (Quick Edit, More) turn
 * fully blue. Encoded as data on each tab so the CSS keys off `data-tone`,
 * never off a per-tab class.
 */
type DockTabTone = 'live' | 'config';

const TABS: { id: DockTab; label: string; icon: IconName; tone: DockTabTone }[] = [
  { id: 'live', label: 'Live', icon: 'broadcast', tone: 'live' },
  { id: 'queue', label: 'Queue', icon: 'queue', tone: 'live' },
  { id: 'edit', label: 'Quick Edit', icon: 'edit', tone: 'config' },
  { id: 'more', label: 'More', icon: 'more', tone: 'config' }
];

interface DockTabBarProps {
  active: DockTab;
  onChange: (tab: DockTab) => void;
}

/** Four equal-width cells, 1px dividers between them, 2px underline when active. */
export default function DockTabBar({ active, onChange }: DockTabBarProps) {
  return (
    <nav className="dock-tabbar" aria-label="Dock sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="dock-tab"
          data-tone={tab.tone}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <Icon name={tab.icon} size={15} />
          <span className="dock-tab__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
