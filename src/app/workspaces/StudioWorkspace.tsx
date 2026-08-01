import PreviewPanel from '../../components/control/PreviewPanel';
import FieldEditor from '../../components/control/FieldEditor';
import { useWorkspace } from './workspaceContext';

/**
 * Studio — compose, edit and preview one graphic.
 *
 * The same preview + editor pair the single-page control surface always had;
 * what changed is that it now has a URL, so the other workspaces can link back
 * to it instead of flipping a local `view` flag.
 */
export default function StudioWorkspace() {
  const { onLoadGraphic } = useWorkspace();
  return (
    <div className="studio-center">
      <PreviewPanel />
      <FieldEditor onLoadGraphic={onLoadGraphic} />
    </div>
  );
}
