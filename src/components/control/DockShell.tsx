import { useState } from 'react';
import type { LastAction } from './StatusBadge';
import DockStatusBar from './DockStatusBar';
import DockTabs, { type DockTab } from './DockTabs';
import StickyLiveBar from './StickyLiveBar';
import TemplateStep from './steps/TemplateStep';
import EditStep from './steps/EditStep';
import LiveStep from './steps/LiveStep';
import BrandStep from './steps/BrandStep';
import LibraryStep from './steps/LibraryStep';

interface DockShellProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
  lastTakenAt: number | null;
}

/**
 * Dock-first operator shell (narrow widths / OBS Custom Browser Dock).
 *
 * A fixed-height app frame: a sticky status bar and tab bar on top, one step's
 * content scrolling in the middle, and an always-visible Take/Clear bar pinned
 * to the bottom. Only the active step mounts, so a beginner sees one task at a
 * time and never scrolls past the live actions.
 */
export default function DockShell({ onTake, onClear, lastAction, lastTakenAt }: DockShellProps) {
  const [tab, setTab] = useState<DockTab>('templates');

  return (
    <div className="control-root control-root--dock">
      <div className="dock">
        <DockStatusBar lastAction={lastAction} />
        <DockTabs active={tab} onChange={setTab} />
        <div className="dock-scroll">
          {tab === 'templates' ? <TemplateStep onNext={() => setTab('edit')} /> : null}
          {tab === 'edit' ? <EditStep onNext={() => setTab('live')} /> : null}
          {tab === 'live' ? <LiveStep lastAction={lastAction} lastTakenAt={lastTakenAt} /> : null}
          {tab === 'brand' ? <BrandStep /> : null}
          {tab === 'library' ? <LibraryStep /> : null}
        </div>
        <StickyLiveBar onTake={onTake} onClear={onClear} lastAction={lastAction} />
      </div>
    </div>
  );
}
