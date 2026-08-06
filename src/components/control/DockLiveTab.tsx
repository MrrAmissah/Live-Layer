import TemplatePreview from '../templates/TemplatePreview';
import DurationControl from './DurationControl';
import RundownQueue from './RundownQueue';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { graphicTitle, templateLabel } from '../../lib/graphicTitle';

/**
 * Live tab body: what Take will send (the real production monitor), then the
 * queue. Take/Clear themselves live in the pinned Program strip above — this
 * tab renders NO live actions of its own, which is what keeps "exactly one
 * Take" true.
 *
 * In rundown mode the monitor shows the SELECTED item (what Take fires) and
 * the queue is the active rundown; in ad-hoc mode it is the draft, with the
 * auto-hide control kept alongside (a live-operation setting, not editing —
 * field editing is the Quick Edit tab's job).
 */
export default function DockLiveTab() {
  const { preview, rundownActive, selectedItem } = useLiveTakeContext();

  const headLabel = rundownActive
    ? selectedItem?.title ?? 'No item selected'
    : graphicTitle({ templateId: preview.templateId, values: preview.values });

  return (
    <div className="dock-tabpane">
      <section className="dock-card dock-next">
        <div className="dock-card__head">
          <span className="ll-kicker">{rundownActive ? 'Selected item' : 'Draft'}</span>
          <span className="dock-card__meta" title={headLabel}>
            {rundownActive ? headLabel : templateLabel(preview.templateId)}
          </span>
        </div>
        {/* Bare frame: just the graphic, shaped to its own crop — the studio's
            reference-monitor chrome wasted half this card at dock widths. */}
        <div className="dock-next__monitor">
          <TemplatePreview
            templateId={preview.templateId}
            values={preview.values}
            theme={preview.theme}
            layout={preview.layout}
            showControls={false}
            frame="bare"
          />
        </div>
        {rundownActive ? null : <DurationControl />}
      </section>

      {rundownActive ? (
        <RundownQueue />
      ) : (
        <section className="dock-card">
          <div className="dock-card__head">
            <span className="ll-kicker">Queue</span>
          </div>
          <p className="dock-card__hint">No rundown active — Take sends the draft above.</p>
        </section>
      )}
    </div>
  );
}
