/**
 * Which `/control` URLs are canonical, and where the rest belong.
 *
 * This lives outside the router on purpose. Redirect *routes* only run when the
 * layout renders its `<Outlet>`, and the dock deliberately does not — below
 * 1024px `ControlPage` returns `DockShell` and never mounts a workspace. So an
 * operator who opened `/control` or a bad section on a dock-width window kept a
 * non-canonical URL in the address bar, and widening the window later fired a
 * surprise redirect. Canonicalising above the shell choice makes the rule the
 * same for both layouts, and keeps it in one place rather than split between
 * route elements and the workspace that renders a section.
 */

export const LIBRARY_SECTIONS = ['saved', 'people', 'assets', 'import'] as const;
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export const DEFAULT_WORKSPACE = '/control/studio';
export const DEFAULT_LIBRARY_SECTION: LibrarySection = 'saved';

const WORKSPACES = ['studio', 'rundown', 'library'] as const;

export const isLibrarySection = (value: string | undefined): value is LibrarySection =>
  LIBRARY_SECTIONS.includes(value as LibrarySection);

/**
 * The canonical path for this URL, or `null` when it is already canonical.
 *
 * Only `/control` and below is this function's business — every other route
 * (`/output`, `/setup`, `/scripture`) is left alone.
 */
export function resolveCanonicalControlPath(pathname: string): string | null {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  if (trimmed !== '/control' && !trimmed.startsWith('/control/')) return null;

  const segments = trimmed.split('/').filter(Boolean).slice(1); // drop 'control'
  const [workspace, section] = segments;

  if (!workspace) return DEFAULT_WORKSPACE;
  if (!WORKSPACES.includes(workspace as (typeof WORKSPACES)[number])) return DEFAULT_WORKSPACE;

  if (workspace === 'library') {
    if (!isLibrarySection(section)) return `/control/library/${DEFAULT_LIBRARY_SECTION}`;
    // A trailing extra segment is still a URL nobody can produce on purpose.
    return segments.length > 2 ? `/control/library/${section}` : null;
  }

  // Studio and Rundown take no sub-path.
  return segments.length > 1 ? `/control/${workspace}` : null;
}
