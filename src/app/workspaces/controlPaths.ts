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

/**
 * Adding a workspace means adding it HERE as well as to the route table.
 *
 * An unlisted workspace is classified as unknown below and canonicalised to
 * Studio, and because `ControlPage` returns that redirect before it ever renders
 * the outlet, the new route element never mounts — the URL silently becomes
 * `/control/studio` with no error. That is exactly how a Library link resolved to
 * Studio at every width in the previous stage. `App.tsx` reads like the route
 * table, so this is the line that gets forgotten.
 */
const WORKSPACES = ['studio', 'rundown', 'library', 'scripture', 'screens'] as const;

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

  const canonical = (() => {
    if (!workspace || !WORKSPACES.includes(workspace as (typeof WORKSPACES)[number])) return DEFAULT_WORKSPACE;
    if (workspace === 'library') {
      return `/control/library/${isLibrarySection(section) ? section : DEFAULT_LIBRARY_SECTION}`;
    }
    return `/control/${workspace}`;
  })();

  /**
   * Compare the REBUILT path with what was asked for, rather than reasoning
   * case by case about what makes a URL wrong.
   *
   * Empty segments are dropped while parsing, so `/control/library//saved` read
   * as already-canonical — while the router, which does not ignore the extra
   * separator, matched no child and rendered a blank workspace. Rebuilding and
   * comparing catches doubled separators, trailing slashes and extra segments
   * with one rule instead of three that can each miss a case.
   */
  return canonical === trimmed ? null : canonical;
}

/** Where the Scripture workspace actually lives. */
export const SCRIPTURE_WORKSPACE = '/control/scripture';

/**
 * `/scripture` was reserved as a top-level route before the workspace existed.
 * It cannot stay one: the realtime channel, the in-flight guard and the only
 * Take/Clear live in the `/control` layout, so a sibling route would need a
 * second command owner — two guards, and two Takes that can race. The reserved
 * URL keeps working as a redirect instead.
 *
 * Rebuild-and-compare, like the function above, so `/scripture/`, `/scripture//`
 * and `/scripture/anything` all resolve rather than 404ing into the catch-all.
 * Returns `null` when the path is not this legacy URL.
 */
export function resolveLegacyScripturePath(pathname: string): string | null {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  if (trimmed !== '/scripture' && !trimmed.startsWith('/scripture/')) return null;
  return SCRIPTURE_WORKSPACE;
}
