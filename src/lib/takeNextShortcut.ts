/**
 * Should this keystroke fire Take Next? — the rule, separated from the listener.
 *
 * Take Next is the only keyboard-reachable action in this app that puts a graphic
 * on air, so the binding is chosen to be **hard to hit by accident** rather than
 * fast to reach. A stray key during a service is a wrong graphic in front of a
 * congregation, and there is no undo for that — Clear is a second action taken
 * after everyone has already seen it.
 *
 * ## Why Ctrl/Cmd + Enter, and not the obvious ones
 *
 * - **Space / Enter alone** are how a focused button is activated, so they would
 *   double-fire whenever Take Next itself had focus, and Space scrolls.
 * - **A bare letter** (`N`) is one missed focus away from disaster: type a
 *   speaker's name into an unfocused field and you have aired the next item.
 *   Guarding on the event target helps, but "the target happened not to be an
 *   input" is a weaker guarantee than "the operator held a modifier".
 * - **Cmd/Ctrl+Shift+N** is New Incognito Window in Chrome, which is what the
 *   OBS dock is.
 *
 * Ctrl/Cmd + Enter is deliberate, two-handed, and carries no conflicting default
 * in a browser panel.
 *
 * ## What is refused
 *
 * Typing context — `input`, `textarea`, `select`, anything `contenteditable`, and
 * anything inside one. The whole control surface is fields; an operator naming a
 * rundown item must never be able to air something by finishing a sentence.
 *
 * Also refused: repeats from a held key, and any combination carrying Alt or
 * Shift, so a near-miss does nothing rather than something.
 */

export interface TakeNextKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the event originated inside somewhere the operator types. */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const element = target as (Element & { isContentEditable?: boolean }) | null | undefined;
  if (!element || typeof element.closest !== 'function') return false;
  if (element.isContentEditable) return true;
  // `closest` rather than a tag check on the target alone: a keystroke can be
  // reported against a node nested inside the field that owns it.
  return Boolean(element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    || EDITABLE.has(element.tagName);
}

export function isTakeNextShortcut(event: TakeNextKeyEvent): boolean {
  if (event.repeat) return false;
  if (event.key !== 'Enter') return false;
  // Exactly one of Ctrl/Cmd, and neither of the other two. Requiring "some
  // modifier" would let Alt+Enter through, which is a different intent.
  if (event.ctrlKey === event.metaKey) return false;
  if (event.altKey || event.shiftKey) return false;
  return !isTypingTarget(event.target);
}

/** What the shortcut is called on screen, so the hint and the rule cannot drift. */
export const TAKE_NEXT_SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘↵' : 'Ctrl+↵';
