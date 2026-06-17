import { templateRegistry } from '../templates/registry';
import { ListFilter } from 'lucide-react';
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
        title="Templates"
        aside={
          <button type="button" className="icon-btn" aria-label={`${templateRegistry.length} templates available`}>
            <ListFilter size={18} aria-hidden />
          </button>
        }
      />
      <div className="ll-panel__body">
        <TemplateList />
      </div>
    </Panel>
  );
}
