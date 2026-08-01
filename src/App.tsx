import { Route, Routes, Navigate } from 'react-router-dom';
import ControlPage from './app/ControlPage';
import OutputPage from './app/OutputPage';
import SetupPage from './app/SetupPage';
import ScripturePage from './app/ScripturePage';
import StudioWorkspace from './app/workspaces/StudioWorkspace';
import RundownWorkspace from './app/workspaces/RundownWorkspace';
import LibraryWorkspace from './app/workspaces/LibraryWorkspace';

/**
 * `/control` is a layout route, not a page: it owns the realtime channel, the
 * Take/Clear decision and the studio-vs-dock choice, and the workspaces render
 * inside it. That keeps exactly one command owner no matter which workspace is
 * open — a second owner would mean a second in-flight guard, and two Takes
 * could race.
 *
 * Old links keep working: `/control` redirects to the Studio workspace.
 */
function App() {
  return (
    <Routes>
      <Route path="/control" element={<ControlPage />}>
        <Route index element={<Navigate to="/control/studio" replace />} />
        <Route path="studio" element={<StudioWorkspace />} />
        <Route path="rundown" element={<RundownWorkspace />} />
        <Route path="library" element={<Navigate to="/control/library/saved" replace />} />
        <Route path="library/:section" element={<LibraryWorkspace />} />
        <Route path="*" element={<Navigate to="/control/studio" replace />} />
      </Route>
      <Route path="/output" element={<OutputPage />} />
      <Route path="/setup" element={<SetupPage />} />
      {/* Reserved: its own workspace, not a panel inside /control. See ScripturePage. */}
      <Route path="/scripture" element={<ScripturePage />} />
      <Route path="*" element={<Navigate to="/control" replace />} />
    </Routes>
  );
}

export default App;
