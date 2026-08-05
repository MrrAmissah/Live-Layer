import { Route, Routes, Navigate } from 'react-router-dom';
import ControlPage from './app/ControlPage';
import OutputPage from './app/OutputPage';
import SetupPage from './app/SetupPage';
import ScriptureRedirect from './app/ScriptureRedirect';
import StudioWorkspace from './app/workspaces/StudioWorkspace';
import RundownWorkspace from './app/workspaces/RundownWorkspace';
import LibraryWorkspace from './app/workspaces/LibraryWorkspace';
import ScriptureWorkspace from './app/workspaces/ScriptureWorkspace';

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
        {/* Canonicalisation lives in ControlPage, not here: redirect routes only
            run when the layout renders its outlet, and the dock never does.

            The empty index and catch-all children exist so that EVERY `/control/*`
            URL matches this layout. Without them a path like `/control/library`
            matches no child, the sibling top-level `*` wins instead, and the URL
            is rewritten to `/control` before the layout can canonicalise it —
            which quietly turned a Library link into Studio. */}
        <Route index element={null} />
        <Route path="studio" element={<StudioWorkspace />} />
        <Route path="rundown" element={<RundownWorkspace />} />
        <Route path="library/:section" element={<LibraryWorkspace />} />
        {/* Adding a workspace here is only half of it — it must also be listed in
            `WORKSPACES` in controlPaths.ts, or ControlPage canonicalises the URL
            to Studio before this element ever mounts. */}
        <Route path="scripture" element={<ScriptureWorkspace />} />
        <Route path="*" element={null} />
      </Route>
      <Route path="/output" element={<OutputPage />} />
      <Route path="/setup" element={<SetupPage />} />
      {/* Was a reserved placeholder page. The workspace had to move inside the
          /control layout to reach the one channel and the one Take, so the
          reserved URL redirects there, carrying search and hash. */}
      <Route path="/scripture" element={<ScriptureRedirect />} />
      <Route path="/scripture/*" element={<ScriptureRedirect />} />
      <Route path="*" element={<Navigate to="/control" replace />} />
    </Routes>
  );
}

export default App;
