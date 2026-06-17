import type { ReactNode } from 'react';
import AppSidebar from './AppSidebar';

interface ControlShellProps {
  commandBar: ReactNode;
  rail: ReactNode;
  preview: ReactNode;
  editor: ReactNode;
  actions: ReactNode;
  brand: ReactNode;
  presets: ReactNode;
}

/**
 * Control-surface shell + responsive layout.
 *
 * A single CSS grid drives both experiences (no separate routes):
 * - Full Studio (wide): rail · (preview / editor) · (actions / brand / presets)
 * - Mid: rail spans the top, preview+actions, editor opposite brand/presets
 * - OBS Dock (narrow): one column ordered preview → actions → rail → editor →
 *   brand → presets, so the preview and Take stay together at the top.
 *
 * Panels stretch to fill their grid areas, turning would-be dead space into
 * panel surface.
 */
export default function ControlShell({
  commandBar,
  rail,
  preview,
  editor,
  actions,
  brand,
  presets
}: ControlShellProps) {
  return (
    <div className="control-root">
      <div className="control-inner">
        {commandBar}
        <div className="control-workspace">
          <AppSidebar />
          <div className="studio-grid">
            <div className="area area--rail">{rail}</div>
            <div className="area area--preview">{preview}</div>
            <div className="area area--editor">{editor}</div>
            <div className="area area--actions">{actions}</div>
            <div className="area area--brand">{brand}</div>
            <div className="area area--presets">{presets}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
