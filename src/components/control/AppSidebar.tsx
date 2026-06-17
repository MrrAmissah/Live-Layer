import {
  BookOpen,
  CircleHelp,
  Download,
  Grid2X2,
  Layers3,
  ListVideo,
  Settings,
  UserRound,
  UsersRound
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: Grid2X2, target: '.area--preview' },
  { label: 'Templates', icon: Layers3, target: '.area--rail', active: true },
  { label: 'Library', icon: BookOpen, target: '.area--presets' },
  { label: 'People', icon: UsersRound, target: '.area--presets' },
  { label: 'Rundowns', icon: ListVideo, target: '.area--presets' },
  { label: 'Import', icon: Download, target: '.area--presets' }
] as const;

const FOOT_ITEMS = [
  { label: 'Settings', icon: Settings, route: '/setup' },
  { label: 'Help', icon: CircleHelp, route: '/setup' }
] as const;

function jumpTo(selector: string) {
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openRoute(path: string) {
  window.open(`${window.location.origin}${path}`, '_blank');
}

export default function AppSidebar() {
  return (
    <aside className="app-sidebar" aria-label="LiveLayer sections">
      <nav className="app-sidebar__nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = 'active' in item && item.active;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className={`app-nav-btn ${active ? 'app-nav-btn--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => jumpTo(item.target)}
            >
              <Icon size={22} strokeWidth={1.9} aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <nav className="app-sidebar__nav app-sidebar__nav--foot" aria-label="Utility">
        {FOOT_ITEMS.map(({ label, icon: Icon, route }) => (
          <button key={label} type="button" className="app-nav-btn" onClick={() => openRoute(route)}>
            <Icon size={22} strokeWidth={1.9} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
