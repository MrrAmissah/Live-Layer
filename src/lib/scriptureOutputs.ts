import { templateRegistry } from '../components/templates/registry';
import { SCRIPTURE_TEMPLATE_ID } from './graphicReadiness';
import { SCRIPTURE_OUTPUTS_KEY } from './storage';

/**
 * Scripture Outputs — one Take, a different look on each screen.
 *
 * The ask, in the operator's words: *"most of these scripture streaming apps
 * have a way of having 2 separate outputs... when I set it in Live Layer the
 * split screen will automatically have its own look instead of having to be
 * switching."* That is ProPresenter's model — named screens, each with its own
 * look for the same content — and it removes the one thing nobody can do
 * mid-service: reach into Settings while a verse is on air.
 *
 * ## The boundary, and it is hard
 *
 * **This re-skins `scripture-card` and nothing else.** Lower thirds,
 * announcements, quote cards, `fullscreen-message` — every other template
 * ignores the screen entirely and renders the variant the operator chose,
 * exactly as before. The gate is a single expression in `OutputPage.tsx`, and
 * it is written against `SCRIPTURE_TEMPLATE_ID` rather than a string literal so
 * it cannot drift.
 *
 * The reason for the boundary is blast radius: a scripture-only feature can
 * only ever be wrong about scripture cards, while a general one is wrong about
 * every graphic on air — and a 12-day convention has no second chance.
 *
 * ## Two halves, and one without the other is a hack
 *
 * 1. **The URL says which screen this is.** Nothing else can carry it: a
 *    browser source's identity is its address. `?screen=split` is a permanent
 *    property of that OBS source, which is exactly why there is nothing to
 *    switch mid-service.
 * 2. **Settings says what each screen looks like.** A `screen -> variantId`
 *    record the operator can see and change without touching OBS.
 *
 * Kept as DATA on purpose. A fourth screen is a row in this file, not a branch
 * in a renderer.
 *
 * ## "Use the graphic's own look" is a real setting, and it is the default
 *
 * A screen may be set to `as-chosen`, which means: render the variant stored on
 * the graphic, exactly as before. That option exists because the alternative
 * strands data. Presets, Recent and every rundown item carry a `variantId` the
 * operator picked deliberately — a main screen hard-wired to one look would
 * silently ignore all of them and turn the library's variant picker into a
 * control with no effect for scripture.
 *
 * So the MAIN screen defaults to `as-chosen` and behaves exactly as it does
 * today, and the split screen defaults to a split look, which is the whole ask:
 * set the verse once, and the split scene renders its own way without anyone
 * switching anything. An operator who does want a fixed look on main can pick
 * one — the row is there.
 *
 * ## What it never does
 *
 * Rewrite the stored graphic. The override is applied to the values handed to
 * the renderer and nowhere else, so Recent, presets and the rundown keep
 * showing the look the operator actually chose — and `OUTPUT_APPLIED` still
 * acknowledges the command as it was sent.
 */

export type ScriptureOutputScreen = 'main' | 'lower' | 'split' | 'house';

export interface ScriptureOutputScreenInfo {
  id: ScriptureOutputScreen;
  /** What the operator calls it on the Screens page. */
  name: string;
  /** The query this screen's browser source carries. Empty for the main screen. */
  query: string;
  /** Icon drawn as the shape of the screen, not a generic monitor. */
  icon: 'screenMain' | 'screenLower' | 'screenSplit' | 'screenHouse';
  /** One line of "what is this for", shown under the card. */
  hint: string;
}

/**
 * The known screens, in the order Settings lists them.
 *
 * `main` is first and is deliberately the one with no query string: an existing
 * browser source URL keeps working untouched, which is the difference between
 * shipping this and re-configuring a rig six days before a convention.
 */
export const SCRIPTURE_OUTPUT_SCREENS: readonly ScriptureOutputScreenInfo[] = [
  {
    id: 'main',
    name: 'Main screen',
    query: '',
    icon: 'screenMain',
    hint: 'The full-frame source. Any /output URL without a screen is this one.'
  },
  {
    id: 'lower',
    name: 'Lower third',
    query: 'screen=lower',
    icon: 'screenLower',
    hint: 'A source that only ever carries the band at the foot of frame.'
  },
  {
    id: 'split',
    name: 'Split screen',
    query: 'screen=split',
    icon: 'screenSplit',
    hint: 'The scene where the camera is scaled down and scripture owns the rest.'
  },
  {
    id: 'house',
    name: 'House screen',
    query: 'screen=house',
    icon: 'screenHouse',
    hint: 'The projectors and LED wall in the room. Never reaches program — it switches independently of the stream.'
  }
];

/**
 * The address to paste into OBS, complete.
 *
 * Assembled here rather than shown as a bare `?screen=split` fragment, because
 * a fragment is precisely the hand-assembly the operator objected to: these
 * sources already carry a `?relay=` for the cross-machine setup, and appending
 * a second query param by hand is where a typo becomes a scene that renders the
 * wrong look — silently, since an unknown screen falls back to main.
 */
export function screenSourceUrl(
  screen: ScriptureOutputScreenInfo,
  origin: string,
  relayUrl: string | null
): string {
  const params = new URLSearchParams();
  if (relayUrl) params.set('relay', relayUrl);
  if (screen.query) params.set('screen', screen.id);
  const query = params.toString();
  return `${origin}/output${query ? `?${query}` : ''}`;
}

export type ScriptureOutputMap = Record<ScriptureOutputScreen, string>;

/**
 * "Use the graphic's own look" — the setting that changes nothing.
 *
 * Not the absence of a value: an absent screen falls back to its DEFAULT, and
 * for the split screen that default is a split look. This is a deliberate
 * choice the operator can make and see, and it is what makes the feature
 * additive rather than a silent override of every scripture graphic ever saved.
 */
export const AS_CHOSEN = 'as-chosen';

/**
 * What each screen renders before anybody opens Settings.
 *
 * These have to be right on a cold start: a browser source added minutes before
 * a service reads them, and on a cross-browser rig (Chrome control, OBS CEF
 * output) they are all it has until the first broadcast arrives.
 */
export const DEFAULT_SCRIPTURE_OUTPUTS: ScriptureOutputMap = {
  // Today's behaviour, unchanged: whatever the operator picked on the graphic.
  main: AS_CHOSEN,
  // Also unchanged. No scripture variant is shaped like a lower third yet, and
  // defaulting a screen to a look nobody chose is worse than leaving it alone.
  lower: AS_CHOSEN,
  // The ask, working out of the box.
  split: 'split-wide',
  // The room reads this one at distance, so it has a look of its own from the
  // start — an as-chosen house screen would put a stream-sized card on a wall
  // in an open field at night.
  house: 'house-wall'
};

const SCREEN_IDS = SCRIPTURE_OUTPUT_SCREENS.map((screen) => screen.id);

const isScreen = (value: unknown): value is ScriptureOutputScreen =>
  typeof value === 'string' && (SCREEN_IDS as string[]).includes(value);

/** Every variant `scripture-card` actually ships, read from the registry. */
export function scriptureVariantIds(): string[] {
  const definition = templateRegistry.find((template) => template.id === SCRIPTURE_TEMPLATE_ID);
  return (definition?.variants ?? []).map((variant) => variant.id);
}

/**
 * Which screen this page is, from its own address.
 *
 * An absent, empty or unrecognised `screen` is the MAIN screen. That is not
 * leniency for its own sake: a typo in an OBS source URL must render the
 * ordinary full-frame card, never a blank scene, and it is what lets every
 * `/output` URL that exists today keep working.
 */
export function readOutputScreen(search: string): ScriptureOutputScreen {
  const raw = new URLSearchParams(search).get('screen')?.trim().toLowerCase() ?? '';
  return isScreen(raw) ? raw : 'main';
}

/**
 * What to call a screen in front of an operator.
 *
 * An output session id names nothing anybody can go and fix, so a screen that
 * reported which one it is gets its Settings name back. One that never said —
 * an older build, or a source added before this shipped — is described rather
 * than guessed at.
 */
export function screenDisplayName(screen: string | null | undefined): string {
  const known = SCRIPTURE_OUTPUT_SCREENS.find((entry) => entry.id === screen);
  return known ? known.name : 'An output screen';
}

/**
 * Accept a stored or broadcast mapping, keeping only what this build can render.
 *
 * Unknown screens are dropped and unknown variants fall back to the default for
 * that screen, because a `variantId` that no longer resolves is the same defect
 * as a rundown item that cannot air: the operator sees a screen configured and
 * gets something else. Renaming a variant therefore costs a reset to the
 * default look, not a blank output.
 */
export function sanitizeScriptureOutputs(value: unknown): ScriptureOutputMap {
  const known = new Set([AS_CHOSEN, ...scriptureVariantIds()]);
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const next = { ...DEFAULT_SCRIPTURE_OUTPUTS };
  for (const screen of SCREEN_IDS) {
    const candidate = source[screen];
    if (typeof candidate === 'string' && known.has(candidate)) next[screen] = candidate;
  }
  return next;
}

/**
 * The variant `screen` should render, or null to leave the graphic alone.
 *
 * Null is returned for `as-chosen`, and for a mapping that names something this
 * build cannot render. In both cases the caller falls through to the variant
 * stored on the graphic, which is always a real one — the screen never gets a
 * look nobody configured, and never loses one the operator did.
 */
export function scriptureLookFor(
  screen: ScriptureOutputScreen,
  outputs: ScriptureOutputMap
): string | null {
  const variantId = outputs[screen];
  if (!variantId || variantId === AS_CHOSEN) return null;
  return scriptureVariantIds().includes(variantId) ? variantId : null;
}

/**
 * This browser's own copy of the mapping.
 *
 * Read by BOTH sides, and the reason it lives here rather than in
 * `lib/storage.ts`: the output page is forbidden from importing the control
 * surface's persistence module, and it needs this on a same-browser rig where
 * there is no relay to broadcast anything.
 *
 * A missing value is not an error — a cross-browser output has no copy at all
 * and learns the mapping from SET_SCRIPTURE_OUTPUTS instead, so this returns
 * the defaults and lets the broadcast correct them.
 */
export function loadScriptureOutputs(): ScriptureOutputMap {
  try {
    const raw = localStorage.getItem(SCRIPTURE_OUTPUTS_KEY);
    return sanitizeScriptureOutputs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SCRIPTURE_OUTPUTS };
  }
}

/**
 * THE SCRIPTURE-ONLY GATE — the one expression, in the one place.
 *
 * Both the output page and the Screens page preview call this. They have to:
 * a preview that resolved the look its own way would be a second implementation
 * of the rule, and the first time the two disagreed the page would be showing
 * the operator something no screen is rendering — which is worse than no
 * preview at all.
 *
 * Scripture and nothing else. Every other template gets its values back
 * untouched, and the graphic itself is never rewritten: the override lands on
 * the values handed to the renderer, so `OUTPUT_APPLIED` still acknowledges the
 * command as sent and Recent, presets and the rundown keep the operator's own
 * choice.
 */
export function resolveScreenValues(
  templateId: string | null | undefined,
  values: Record<string, string>,
  screen: ScriptureOutputScreen,
  outputs: ScriptureOutputMap
): Record<string, string> {
  if (templateId !== SCRIPTURE_TEMPLATE_ID) return values;
  const look = scriptureLookFor(screen, outputs);
  return look ? { ...values, variantId: look } : values;
}
