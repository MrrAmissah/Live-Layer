import { Icon, type IconName } from '../../lib/icons';
import TemplateLibrary from './TemplateLibrary';

export type StudioView = 'templates' | 'saved' | 'people' | 'assets' | 'rundowns' | 'import';

const SECONDARY: Array<{ id: StudioView; label: string; icon: IconName }> = [
  { id: 'saved', label: 'Saved graphics', icon: 'bookmark' },
  { id: 'people', label: 'People', icon: 'user' },
  { id: 'assets', label: 'Assets', icon: 'image' },
  { id: 'rundowns', label: 'Rundowns', icon: 'queue' },
  // Desktop path to the .livelayerpack preview/import flow. Without it the
  // feature was only reachable by shrinking below the dock breakpoint.
  { id: 'import', label: 'Import pack', icon: 'layers' }
];

/**
 * Left navigation shell (studio). Templates is the active destination and its
 * searchable library renders inline; the other destinations sit below a divider
 * so browsing templates is clearly separated from switching sections. Every
 * existing management surface is preserved (App wiring swaps the centre).
 */
export default function StudioNav({ view, onViewChange }: { view: StudioView; onViewChange: (view: StudioView) => void }) {
  return (
    <nav className="studio-nav" aria-label="Library">
      <div className="studio-nav__scroll">
        <p className="studio-nav__heading">
          <span>Library</span>
          <Icon name="chevronDown" size={15} />
        </p>

        <button
          type="button"
          className={`studio-nav__item studio-nav__item--primary${view === 'templates' ? ' studio-nav__item--active' : ''}`}
          aria-current={view === 'templates' ? 'page' : undefined}
          onClick={() => onViewChange('templates')}
        >
          <Icon name="grid" size={18} />
          <span>Templates</span>
        </button>

        {view === 'templates' ? (
          <div className="studio-nav__library">
            <TemplateLibrary />
          </div>
        ) : null}

        <div className="studio-nav__divider" />

        <ul className="studio-nav__list">
          {SECONDARY.map((dest) => (
            <li key={dest.id}>
              <button
                type="button"
                className={`studio-nav__item${view === dest.id ? ' studio-nav__item--active' : ''}`}
                aria-current={view === dest.id ? 'page' : undefined}
                onClick={() => onViewChange(dest.id)}
              >
                <Icon name={dest.icon} size={18} />
                <span>{dest.label}</span>
              </button>
            </li>
          ))}
        </ul>
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
