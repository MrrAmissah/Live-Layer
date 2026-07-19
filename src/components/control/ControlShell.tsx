import type { ReactNode } from 'react';

interface ControlShellProps {
  commandBar: ReactNode;
  nav: ReactNode;
  center: ReactNode;
  rail: ReactNode;
}

/**
 * Studio shell — one continuous desktop workspace, not a grid of dashboard
 * cards: left library/navigation, a central preview + editor, and the right
 * Program/Live + queue rail. Structure comes from surfaces, dividers and
 * spacing; the preview stays the centre of gravity.
 */
export default function ControlShell({ commandBar, nav, center, rail }: ControlShellProps) {
  return (
    <div className="control-root control-root--studio">
      <div className="control-inner">
        {commandBar}
        <div className="studio">
          <aside className="studio__nav">{nav}</aside>
          <main className="studio__center">{center}</main>
          <aside className="studio__rail">{rail}</aside>
        </div>
      </div>
    </div>
  );
}
