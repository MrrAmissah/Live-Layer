import RundownLibrary from '../../components/control/RundownLibrary';
import WorkspacePanel from './WorkspacePanel';

/**
 * Rundown — preparing and ordering a service.
 *
 * This workspace owns **management**: create, rename, delete, export, add the
 * current draft, and the ordered item list with its reorder/duplicate/delete
 * actions. Running the queue during a service stays in the Program rail, which
 * is on screen in every workspace — so the rail shows the live summary and
 * Previous/Next while the full editable list lives here, rather than the same
 * list appearing twice on one screen.
 */
export default function RundownWorkspace() {
  return (
    <WorkspacePanel kicker="Rundown">
      <RundownLibrary />
    </WorkspacePanel>
  );
}
