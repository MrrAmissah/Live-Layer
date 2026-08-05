import type { Location, To } from 'react-router-dom';

/**
 * Build a navigation target that keeps the current query and hash.
 *
 * Audited on the merge base: **1 of 8** navigations in the control surface
 * preserved `search`. Everything else passed a bare path string, which drops it.
 * That matters because `/setup` hands operators a LAN URL shaped
 * `…/control?relay=host:port`, and `getRealtimeRelayUrl` reads that param when the
 * realtime channel is constructed.
 *
 * Severity is uneven, and the helper exists so the distinction stops mattering:
 *
 *  - `App.tsx`'s catch-all was the real hazard. Any unmatched URL carrying
 *    `?relay=` — a hand-shortened `/?relay=…`, a typo, a stale bookmark — was
 *    rewritten to bare `/control` **before the value had been persisted**, so a
 *    fresh machine or profile came up with no relay at all. Nothing recovers from
 *    that, because the fallback it would rely on was never written.
 *  - The rest are shareability: an in-flight session survives on the stored value,
 *    but the address bar stops being a URL you can paste into an OBS dock or a
 *    second machine.
 *
 * Seven of eight sites got this wrong, which is the argument for one helper rather
 * than eight remembered call sites. See issue #19.
 */
export function withUrlState(pathname: string, location: Pick<Location, 'search' | 'hash'>): To {
  return { pathname, search: location.search, hash: location.hash };
}

/**
 * The same thing for a `<Link>`/`<NavLink>` `to`, which takes the object form too.
 * Named separately only so call sites read as what they are.
 */
export const linkTo = withUrlState;
