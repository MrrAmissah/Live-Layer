import { templateRegistry } from '../templates/registry';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import TemplateList from './TemplateList';

/**
 * Left graphics rail (studio mode). Chrome around the shared TemplateList,
 * which lists every template grouped by category as selectable presets.
 */
export default function TemplateRail() {
  return (
    <Panel className="ll-fill">
      <SectionHeader
        kicker="Graphics"
        title="Templates"
        aside={<span className="ll-count">{templateRegistry.length}</span>}
      />
      <div className="ll-panel__body">
        <TemplateList />
      </div>
    </Panel>
  );
}
