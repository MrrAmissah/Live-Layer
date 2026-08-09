/**
 * Where an operator goes to create or pick a rundown — which is a different
 * place in each layout.
 *
 * The studio has a Rundown workspace; the dock has no ROUTER navigation (it
 * renders no outlet, so workspace routes don't exist there) — it navigates by
 * its four tabs, and rundown management lives in its Queue tab. Any surface
 * that both layouts mount has to say the right one, or a recovery instruction
 * sends half the operators somewhere that does not exist. That is exactly what
 * happened when the studio copy was corrected in a component the dock also
 * renders — and again when the dock's Library tab was retired while this file
 * still pointed at "Library → Rundowns".
 */
export type ControlSurface = 'studio' | 'dock';

export function rundownDestination(surface: ControlSurface): string {
  return surface === 'dock' ? 'the Queue tab' : 'the Rundown workspace';
}

export function noActiveRundownMessage(surface: ControlSurface): string {
  return `Create or select a rundown first — ${surface === 'dock' ? 'open the Queue tab' : 'open the Rundown workspace'}.`;
}
