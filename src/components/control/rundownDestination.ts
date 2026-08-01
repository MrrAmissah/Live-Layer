/**
 * Where an operator goes to create or pick a rundown — which is a different
 * place in each layout.
 *
 * The studio has a Rundown workspace; the dock has no workspace navigation at
 * all and keeps its rundown manager under its Library tab. Any surface that both
 * layouts mount has to say the right one, or a recovery instruction sends half
 * the operators somewhere that does not exist. That is exactly what happened when
 * the studio copy was corrected in a component the dock also renders.
 */
export type ControlSurface = 'studio' | 'dock';

export function rundownDestination(surface: ControlSurface): string {
  return surface === 'dock' ? 'Library → Rundowns' : 'the Rundown workspace';
}

export function noActiveRundownMessage(surface: ControlSurface): string {
  return `Create or select a rundown first — ${surface === 'dock' ? 'open Library → Rundowns' : 'open the Rundown workspace'}.`;
}
