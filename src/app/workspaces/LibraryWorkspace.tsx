import { NavLink, useParams } from 'react-router-dom';
import PresetControls from '../../components/control/PresetControls';
import PeopleLibrary from '../../components/control/PeopleLibrary';
import AssetsView from '../../components/control/AssetsView';
import ImportPackPreview from '../../components/control/ImportPackPreview';
import WorkspacePanel from './WorkspacePanel';
import { useWorkspace } from './workspaceContext';

/**
 * Library — everything the operator keeps between services, in one place.
 *
 * `/control/library` redirects to a section, so a section is always in the URL
 * and `NavLink` owns `aria-current` — setting it by hand alongside `NavLink`
 * meant the two disagreed on the sectionless URL.
 *
 * Saved graphics, People, Assets and Import pack were four separate top-level
 * destinations, which made the nav a list of collections rather than a list of
 * jobs. They are one workspace now, with sub-navigation, because "find
 * something I saved" is a single intent.
 *
 * Each section renders the SAME component the single-page surface used — these
 * are moves, not copies. The dock keeps its own Library tab and its own
 * sub-tabs, untouched.
 */

const SECTIONS = [
  { id: 'saved', label: 'Saved graphics' },
  { id: 'people', label: 'People' },
  { id: 'assets', label: 'Assets' },
  { id: 'import', label: 'Import pack' }
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const isSection = (value: string | undefined): value is SectionId =>
  SECTIONS.some((section) => section.id === value);

export default function LibraryWorkspace() {
  const { section } = useParams();
  const { onLoadGraphic } = useWorkspace();

  // `ControlPage` canonicalises the URL before this renders, so an unknown
  // section never reaches here; the guard keeps the type honest.
  const active: SectionId = isSection(section) ? section : 'saved';
  const label = SECTIONS.find((entry) => entry.id === active)!.label;

  return (
    <WorkspacePanel kicker={`Library · ${label}`}>
      <nav className="library-subnav" aria-label="Library sections">
        {SECTIONS.map((entry) => (
          <NavLink
            key={entry.id}
            to={`/control/library/${entry.id}`}
            className={({ isActive }) => `library-subnav__link${isActive ? ' library-subnav__link--active' : ''}`}
          >
            {entry.label}
          </NavLink>
        ))}
      </nav>

      <div className="library-section">
        {active === 'saved' ? <PresetControls onLoadGraphic={onLoadGraphic} /> : null}
        {active === 'people' ? <PeopleLibrary /> : null}
        {active === 'assets' ? <AssetsView /> : null}
        {active === 'import' ? <ImportPackPreview /> : null}
      </div>
    </WorkspacePanel>
  );
}
