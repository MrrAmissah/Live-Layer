import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { getPack } from '../../lib/packs';
import { Icon } from '../../lib/icons';

/**
 * Dock masthead: identity row plus the full-bleed EVENT block naming the active
 * pack, so an operator always knows which production's look they are driving.
 *
 * Deliberately quieter than the mockups: no `✕` (an OBS dock has nothing to
 * close) and no `⋮` overflow (no menu exists to open yet — a control that does
 * nothing is worse than no control; the More tab will own utilities).
 */
export default function DockHeader() {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const packName = getPack(activePackId).name;

  return (
    <>
      <header className="dock-header">
        <span className="dock-header__brand">
          <span className="dock-header__mark" aria-hidden>
            <Icon name="layers" size={21} />
          </span>
          <span className="dock-header__title">LiveLayer Operator</span>
        </span>
      </header>
      <div className="dock-event" title="Active event pack">
        <span className="ll-kicker">Event</span>
        <span className="dock-event__name">{packName}</span>
      </div>
    </>
  );
}
