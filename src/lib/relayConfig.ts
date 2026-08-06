/**
 * Which relay this page talks to — the ONE piece of configuration both surfaces
 * share, split out of `lib/realtime.ts` so `/output` can resolve its relay
 * without importing the control-side transport (createMessage / publishCommand
 * live there, and the output isolation guard forbids the whole module inside
 * the output render path).
 *
 * This module deliberately keeps `getRealtimeRelayUrl`'s persistence side
 * effects: `?relay=<url>` is stored so an OBS Browser Source keeps its relay
 * across refreshes, and `?relay=off` (or empty) is the documented way to clear
 * it. It writes exactly one localStorage key — the relay address — and is the
 * output closure's single sanctioned localStorage-writing module for that
 * reason (see scripts/check-output-isolation.mjs).
 */
const RELAY_QUERY_PARAM = 'relay';
const RELAY_STORAGE_KEY = 'livelayer:relayUrl';

export function getRealtimeRelayUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const rawParam = params.get(RELAY_QUERY_PARAM);
  if (rawParam !== null) {
    if (rawParam === '' || rawParam.toLowerCase() === 'off') {
      try {
        localStorage.removeItem(RELAY_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      return null;
    }

    const normalized = normalizeRelayUrl(rawParam);
    if (normalized) {
      try {
        localStorage.setItem(RELAY_STORAGE_KEY, normalized);
      } catch {
        // ignore storage errors
      }
      return normalized;
    }
  }

  try {
    const stored = localStorage.getItem(RELAY_STORAGE_KEY);
    return stored ? normalizeRelayUrl(stored) : null;
  } catch {
    return null;
  }
}

function normalizeRelayUrl(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
