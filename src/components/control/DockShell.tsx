import { useEffect, useRef, useState } from 'react';
import type { LastAction } from './StatusBadge';
import { useRelayStatus } from '../../hooks/useRelayStatus';
import DockHeader from './DockHeader';
import DockTabBar, { type DockTab } from './DockTabBar';
import DockProgramStrip from './DockProgramStrip';
import DockLiveTab from './DockLiveTab';
import DockQueueTab from './DockQueueTab';
import DockQuickEditTab from './DockQuickEditTab';
import DockFooter from './DockFooter';
import DockSettingsTab from './DockSettingsTab';
import { useDockPrefs } from '../../store/useDockPrefs';
import { resolveStripDensity, type StripDensity } from '../../lib/dockDensity';

interface DockShellProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
  /**
   * Accepted for prop-compatibility with ControlPage but unused here: the
   * Program strip reads `program.takenAt` from the store for its clock.
   */
  lastTakenAt: number | null;
  /** A command is in flight — passed through to the Program strip's actions. */
  sending?: boolean;
}

/**
 * Dock operator shell (narrow widths / OBS Custom Browser Dock).
 *
 * A fixed-height app frame: header (brand + event switcher + relay dot) and
 * tab bar on top, the Program strip pinned beneath them (so Take/Clear and the
 * honest Program record are visible on EVERY tab), one tab's content scrolling
 * in the middle, and the transport footer at the bottom — hidden by CSS on
 * short docks, where the header's relay dot carries the same state.
 *
 * The relay is polled HERE, once, and handed to both header and footer:
 * mounting useRelayStatus in each would double the probe traffic.
 *
 * Only the active tab mounts — an OBS dock shares CPU with an encoder, and a
 * GraphicStage render per hidden tab is a real cost. Settings is a real tab now,
 * carrying only preferences and information that already have behaviour.
 */
export default function DockShell({ onTake, onClear, lastAction, sending = false }: DockShellProps) {
  const [tab, setTab] = useState<DockTab>('live');
  const relay = useRelayStatus();
  const preferCompact = useDockPrefs((state) => state.compactProgramStrip);

  /**
   * The dock's own height, observed rather than inferred from the viewport: an
   * OBS dock is resized by dragging its edge, so the window never changes size
   * and a media query would never fire. Same reasoning as the footer collapse.
   */
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);
  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height;
      if (typeof next === 'number') setDockHeight(Math.round(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Kept in state so the resolver can see what is currently applied and hold
  // the band between its thresholds instead of oscillating there.
  const [density, setDensity] = useState<StripDensity>(preferCompact ? 'compact' : 'full');
  const resolved = resolveStripDensity({ dockHeight, preferCompact, current: density });
  useEffect(() => {
    if (resolved.density !== density) setDensity(resolved.density);
  }, [resolved.density, density]);

  return (
    <div className="control-root control-root--dock">
      <div className="dock" ref={frameRef}>
        <DockHeader relay={relay} />
        <DockTabBar active={tab} onChange={setTab} />
        <DockProgramStrip onTake={onTake} onClear={onClear} sending={sending} lastAction={lastAction} density={resolved.density} />
        <div className="dock-scroll">
          {tab === 'live' ? <DockLiveTab /> : null}
          {tab === 'queue' ? (
            <DockQueueTab
              onPreviewSelected={() => setTab('live')}
              onEditSelected={() => setTab('edit')}
            />
          ) : null}
          {tab === 'edit' ? <DockQuickEditTab onOpenQueue={() => setTab('queue')} /> : null}
          {tab === 'settings' ? <DockSettingsTab relay={relay} density={resolved} /> : null}
        </div>
        <DockFooter relay={relay} />
      </div>
    </div>
  );
}

