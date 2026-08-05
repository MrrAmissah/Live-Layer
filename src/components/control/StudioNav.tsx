import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../../lib/icons';
import TemplateLibrary from './TemplateLibrary';

interface Workspace {
  to: string;
  label: string;
  icon: IconName;
}

/**
 * Three jobs, not six collections.
 *
 * The nav used to list every place data lived — Saved graphics, People, Assets,
 * Rundowns, Import pack — which made switching sections feel like browsing a
 * filing cabinet. Library now holds all of those, so the top level reads as what
 * an operator is doing: composing a graphic, preparing the running order, or
 * finding something they kept.
 */
const WORKSPACES: Workspace[] = [
  { to: '/control/studio', label: 'Studio', icon: 'grid' },
  { to: '/control/scripture', label: 'Scripture', icon: 'book' },
  { to: '/control/rundown', label: 'Rundown', icon: 'queue' },
  { to: '/control/library', label: 'Library', icon: 'bookmark' }
];

/**
 * Left navigation (studio): the workspace switcher, plus the searchable
 * template library inline while Studio is the open workspace — the library is a
 * picker for composing, so it belongs with the surface that composes.
 *
 * These are real links now. `aria-current="page"` comes from `NavLink`, the
 * browser's back button works, and a workspace can be opened directly by URL.
 */
export default function StudioNav() {
  const { pathname } = useLocation();
  const studioOpen = pathname.startsWith('/control/studio');

  return (
    <nav className="studio-nav" aria-label="Workspaces">
      <div className="studio-nav__scroll">
        <p className="studio-nav__heading">
          <span>Workspaces</span>
        </p>

        <ul className="studio-nav__list studio-nav__list--primary">
          {WORKSPACES.map((workspace) => (
            <li key={workspace.to}>
              <NavLink
                to={workspace.to}
                className={({ isActive }) =>
                  `studio-nav__item studio-nav__item--primary${isActive ? ' studio-nav__item--active' : ''}`
                }
              >
                <Icon name={workspace.icon} size={18} />
                <span>{workspace.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {studioOpen ? (
          <>
            <div className="studio-nav__divider" />
            <div className="studio-nav__library">
              <TemplateLibrary />
            </div>
          </>
        ) : null}
      </div>

      <div className="studio-nav__footer">
        <button type="button" className="studio-nav__foot-btn" aria-label="Settings" onClick={() => window.open(`${window.location.origin}/setup`, '_blank')}>
          <Icon name="settings" size={18} />
        </button>
        <button type="button" className="studio-nav__foot-btn" aria-label="Preview output" onClick={() => window.open(`${window.location.origin}/output?debug=1`, '_blank')}>
          <Icon name="previewOutput" size={18} />
        </button>
      </div>
    </nav>
  );
}
