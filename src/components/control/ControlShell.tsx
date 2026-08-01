import { useEffect, useRef, type ReactNode } from 'react';

interface ControlShellProps {
  commandBar: ReactNode;
  nav: ReactNode;
  center: ReactNode;
  rail: ReactNode;
  /** Live actions for layouts where the rail is off-screen — see StudioLiveBar. */
  liveBar?: ReactNode;
  /** Changes when the workspace changes, so the centre region can take focus. */
  centerKey?: string;
}

/**
 * Studio shell — one continuous desktop workspace, not a grid of dashboard
 * cards: left library/navigation, a central workspace, and the right
 * Program/Live + queue rail, with the live-action bar as the frame's last row.
 *
 * The bar is a flex sibling of the grid rather than an overlay, so it can never
 * cover the content it sits below — the same shape the dock's frame already
 * uses.
 */
export default function ControlShell({ commandBar, nav, center, rail, liveBar, centerKey }: ControlShellProps) {
  const centerRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  /**
   * Switching workspace swaps the whole centre region. Without moving focus, a
   * keyboard operator's focus stays on the link they just activated and nothing
   * signals that the main region changed — so focus goes to the region itself,
   * which is named and takes focus programmatically only.
   *
   * Skipped on first paint: landing on a page should not steal focus from the
   * document start.
   */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    centerRef.current?.focus();
  }, [centerKey]);

  return (
    <div className="control-root control-root--studio">
      <div className="control-inner">
        {/* Stacked, the live actions are the last of well over a hundred tab
            stops — behind the whole template library and the editor. This is the
            keyboard equivalent of the bar itself. */}
        <a className="skip-link" href="#live-actions">
          Skip to live actions
        </a>
        {commandBar}
        <div className="studio">
          <aside className="studio__nav" aria-label="Workspaces and template library">
            {nav}
          </aside>
          {/* Keyed by route so React remounts it on navigation, which is what
              lets the workspace move focus to its own heading. */}
          <main className="studio__center" key={centerKey} ref={centerRef} tabIndex={-1} aria-label="Workspace">
            {center}
          </main>
          <aside className="studio__rail" aria-label="Program and live actions">
            {rail}
          </aside>
        </div>
        <div id="live-actions">{liveBar}</div>
      </div>
    </div>
  );
}
