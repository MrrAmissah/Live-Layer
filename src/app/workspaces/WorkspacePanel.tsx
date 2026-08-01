import type { ReactNode } from 'react';
import Panel from '../../components/control/Panel';

/** A workspace's full-height panel frame, with its identifying kicker. */
export default function WorkspacePanel({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <Panel className="ll-fill editor-panel">
      <div className="editor-head">
        <span className="ll-kicker">{kicker}</span>
      </div>
      <div className="ll-panel__body">{children}</div>
    </Panel>
  );
}
