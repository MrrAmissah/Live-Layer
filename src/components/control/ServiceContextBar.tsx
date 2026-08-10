import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useServiceContext, setServiceContext } from '../../hooks/useServiceContext';
import { isConfiguredStart } from '../../lib/serviceContext';
import { Icon } from '../../lib/icons';

/**
 * What service is being prepared, and when it starts.
 *
 * Two jobs, and the first is the reason it sits in the command bar rather than
 * behind a settings page: an operator must be able to see at a glance that they
 * are editing the evening session and not this morning's, because editing the
 * wrong event is silent and expensive. The second is that `{{eventTime}}` and
 * `{{countdown}}` need a real start time before they can resolve to anything.
 *
 * Collapsed to a single line until opened. A permanent setup panel would spend
 * vertical space every minute of a service to answer a question asked twice.
 *
 * It configures the service and nothing else. Event packs keep their own
 * control beside this one and their own single owner — a `service.packId` here
 * would be a second authority over the same value, disagreeing the moment
 * somebody changed pack outside service setup.
 */
export default function ServiceContextBar() {
  const service = useServiceContext();
  const [open, setOpen] = useState(false);
  const configured = isConfiguredStart(service.startAt);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  /**
   * The command bar clips its overflow — deliberately, so its own controls
   * cannot spill sideways when the window narrows — so a panel rendered inside
   * it is sliced off at the bar's bottom edge. It is portalled out and anchored
   * by measurement instead. `.control-root` rather than `document.body` follows
   * the pack-switch dialog, keeping the app's styles and stacking context.
   */
  const root = typeof document === 'undefined' ? null : document.querySelector('.control-root');

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const button = summaryRef.current?.getBoundingClientRect();
      const bounds = root?.getBoundingClientRect();
      if (!button || !bounds) return;
      // Kept inside the shell, so a bar control near the right edge does not
      // open a panel half off the screen.
      const width = panelRef.current?.offsetWidth ?? 340;
      const left = Math.min(button.left - bounds.left, bounds.width - width - 12);
      setAnchor({ top: button.bottom - bounds.top + 6, left: Math.max(12, left) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, root]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || summaryRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Capture, so a click that lands on a control elsewhere still closes this.
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  /** "10:30" from a local wall-clock string, without constructing a Date. */
  const clock = configured ? service.startAt.slice(11, 16) : null;

  const panel = (
    <div
      ref={panelRef}
      className="cmd-service__panel"
      style={anchor ? { top: anchor.top, left: anchor.left } : { visibility: 'hidden' }}
    >
      <label className="field">
        <span className="field__label"><span>Service or session</span></span>
        <input
          className="field__input"
          value={service.name}
          placeholder="Sunday Service, Evening Session, Convention…"
          onChange={(event) => setServiceContext({ ...service, name: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label"><span>Starts</span></span>
        <input
          className="field__input"
          type="datetime-local"
          value={service.startAt}
          onChange={(event) => setServiceContext({ ...service, startAt: event.target.value })}
        />
        <span className="field__hint">
          {configured
            ? 'Date and time fields can use this. Graphics already on air keep the time they were taken with.'
            : 'Set a start time to use the event time and countdown fields.'}
        </span>
      </label>
    </div>
  );

  return (
    <div className="cmd-service">
      <button
        ref={summaryRef}
        type="button"
        className="cmd-service__summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Service being prepared"
      >
        <span className="cmd-service__label">Service</span>
        <span className="cmd-service__name">{service.name || 'Not set'}</span>
        {/* An unconfigured time says so, rather than showing a placeholder that
            reads like a decision. */}
        <span className={`cmd-service__time${configured ? '' : ' is-unset'}`}>
          {clock ?? 'No start time'}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
      </button>

      {open && root ? createPortal(panel, root) : null}
    </div>
  );
}
