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

export type ScriptureOutputScreen = 'main' | 'scripture' | 'split' | 'split-dual' | 'house';

export interface ScriptureOutputScreenInfo {
  id: ScriptureOutputScreen;
  /** What the operator calls it on the Screens page. */
  name: string;
  /** The query this screen's browser source carries. Empty for the main screen. */
  query: string;
  /** Icon drawn as the shape of the screen, not a generic monitor. */
  icon: 'screenMain' | 'screenScripture' | 'screenSplit' | 'screenHouse';
  /** One line of "what is this for", shown under the card. */
  hint: string;
  /**
   * WHAT THIS SCREEN WILL RENDER AT ALL.
   *
   * `all` is every graphic, which is what a full-frame source has always done.
   * `scripture` renders scripture cards and ignores everything else — it does
   * not clear, it does not acknowledge, it simply is not addressed by that
   * command.
   *
   * The split and house scenes exist because of this. They are COMPOSITIONS: a
   * camera squeezed to one side with scripture holding the rest, or a wall in a
   * field showing one verse. A lower third arriving in that column is not a
   * different graphic, it is the scene falling apart — and the operator who
   * sent it was addressing the stream, not the projectors.
   */
  scope: 'all' | 'scripture';
}

/**
 * The known screens, in the order Settings lists them.
 *
 * `main` is first and is deliberately the one with no query string: an existing
 * browser source URL keeps working untouched, which is the difference between
 * shipping this and re-configuring a rig six days before a convention.
 *
 * ## MAIN IS THE ONLY SCREEN THAT CARRIES A LOWER THIRD
 *
 * Asked for in the operator's words: the lower thirds, the announcements "and
 * others too be strict for the main screen". Split and house already refused
 * them; a fourth screen, `lower`, did not — it was `scope: 'all'`, so it was a
 * second full overlay in everything but name, and it made the rule impossible
 * to state. It is retired rather than re-scoped: no source on the rig ever used
 * it, no scripture look was ever defined for it, and a screen that exists only
 * to be an exception to the rule is worse than one fewer row.
 *
 * A URL still carrying `?screen=lower` degrades to `main` through
 * `readOutputScreen`, which is the safe direction on purpose — an overlay that
 * shows more than expected is visible and recoverable, while one that silently
 * renders nothing is a mystery to debug mid-service.
 */
export const SCRIPTURE_OUTPUT_SCREENS: readonly ScriptureOutputScreenInfo[] = [
  {
    id: 'main',
    name: 'Main screen',
    query: '',
    icon: 'screenMain',
    scope: 'all',
    hint: 'The full-frame source. Any /output URL without a screen is this one.'
  },
  {
    id: 'scripture',
    name: 'Scripture screen',
    query: 'screen=scripture',
    icon: 'screenScripture',
    scope: 'scripture',
    /**
     * The full-frame scripture scene, and the row that made "main only" a rule
     * an operator could actually apply.
     *
     * `PPC · Scripture` on the rig is a whole scene built around a verse — its
     * camera and NDI are off and a still fills the frame. It was running a MAIN
     * output source, so a lower third taken while it was on program landed on
     * it. Neither existing scoped screen could replace that source: `split`
     * forces a look drawn for a cropped camera and `house` one drawn for a wall
     * across a field, and this scene is neither.
     *
     * So it is scripture-only like those two, and `as-chosen` like main — the
     * verse in the look the operator picked, with nothing else able to reach it.
     */
    hint: 'A full-frame source that only ever carries scripture, in the look the graphic was given.'
  },
  {
    id: 'split',
    name: 'Split screen',
    query: 'screen=split',
    icon: 'screenSplit',
    scope: 'scripture',
    hint: 'The scene where the camera is scaled down and scripture owns the rest. Scripture only — a lower third sent to air will not disturb it.'
  },
  {
    id: 'split-dual',
    name: 'Split screen (dual)',
    query: 'screen=split-dual',
    icon: 'screenSplit',
    scope: 'scripture',
    /**
     * REGISTERED AHEAD OF THE LOOK IT WILL EVENTUALLY WEAR, and that is a safety
     * fix rather than a head start.
     *
     * `PPC GFX · SPLIT DUAL` is live in OBS on this id. An unrecognised screen
     * falls back to `main` through `readOutputScreen`, and `main` carries
     * EVERYTHING — so until this row existed, that scene was a full overlay: a
     * lower third or an announcement taken during a service would have landed
     * on it, over a plate with two scripture wells cut into it. It was the
     * program scene when I found it.
     *
     * Scoped to scripture like its siblings, so the scene can only ever be
     * disturbed by a verse. The two-language TEMPLATE that fills both wells is
     * separate work; this row is what makes the scene safe in the meantime.
     */
    hint: 'The dual scene — one passage in two languages, in the plate’s two wells. Scripture only.'
  },
  {
    id: 'house',
    name: 'House screen',
    query: 'screen=house',
    icon: 'screenHouse',
    scope: 'scripture',
    hint: 'The projectors and LED wall in the room. Scripture only, and it switches independently of the stream.'
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
  // Also as-chosen. This screen's job is scoping, not re-skinning — it exists
  // so a scripture scene cannot be interrupted, and forcing a look on top of
  // that would take away the variant picker for the one scene most likely to
  // want a deliberate one.
  scripture: AS_CHOSEN,
  // The ask, working out of the box.
  split: 'split-wide',
  /**
   * `as-chosen` deliberately. The plate paints two RECESSES rather than cards,
   * and no variant fills both yet — so forcing a look here would place one card
   * confidently in the wrong place. Left alone, the operator's own choice
   * renders and the second well shows the plate's quiet panel, which is what
   * the artwork already does when nothing is taken.
   */
  'split-dual': AS_CHOSEN,
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

/**
 * May this screen render this graphic at all?
 *
 * Separate from `resolveScreenValues`, which decides what a scripture card
 * LOOKS like here. This decides whether the command is addressed to this screen
 * in the first place.
 *
 * A screen that answers false does nothing: it keeps what it is showing, sends
 * no acknowledgement, and lets the graphic pass. Not acknowledging is the
 * honest part — `OUTPUT_APPLIED` means "I put this on screen", and a screen
 * that ignored a command must not confirm a Take on its behalf. Program is then
 * confirmed by whichever screens did render it, and by nothing else.
 *
 * A CLEAR is never filtered. Clear means clear, on every screen, and an
 * operator reaching for it in a hurry must not have to think about which
 * screens were listening.
 */
export function screenRenders(screen: ScriptureOutputScreen, templateId: string | null | undefined): boolean {
  const info = SCRIPTURE_OUTPUT_SCREENS.find((entry) => entry.id === screen);
  if (!info || info.scope === 'all') return true;
  return templateId === SCRIPTURE_TEMPLATE_ID;
}
