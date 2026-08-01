import { useOutletContext } from 'react-router-dom';
import type { GraphicInstance } from '../../types/graphics';

/**
 * What the control layout hands its workspaces.
 *
 * Deliberately small: workspaces render surfaces and navigate. They do not
 * publish, do not own the realtime channel, and do not decide what a Take
 * means — those stay in `ControlPage`, which is the only place that can
 * serialise commands across every workspace.
 */
export interface WorkspaceContext {
  /** Load a stored graphic into the editor and go to the Studio workspace. */
  onLoadGraphic: (graphic: GraphicInstance) => void;
}

export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext>();
}
