import { STAGE_WIDTH, STAGE_HEIGHT, BARE_MARGIN, BARE_MIN_CROP, type StageRect } from './stage';

/**
 * Content-fit measurement for the bare preview (dock DRAFT/EDITING cards).
 *
 * The bare frame's job is to show the design itself, so its crop must follow
 * the rendered graphic's own bounds — no fixed rectangle can do that (a
 * single-line lower third is ~1/6 the height of a medallion variant).
 *
 * MEASUREMENT RULE — layout geometry only. Entrance animations move graphics
 * with transforms (slide/wipe/mask reveals), and `getBoundingClientRect`
 * read mid-animation returns wherever the element happens to be — including
 * a masked line still translated below its mask. `offsetLeft/Top/Width/
 * Height` describe the *laid-out* box, which the transform never touches,
 * so a measurement taken during an entrance equals one taken after it.
 * Do not reintroduce getBoundingClientRect here.
 */

/** Strict rect equality — the state guard that keeps re-measures from re-rendering. */
export function sameRect(a: StageRect, b: StageRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function unionOf(a: StageRect, b: StageRect): StageRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  };
}

function intersectionOf(a: StageRect, b: StageRect): StageRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The element's laid-out box in stage coordinates: its own offset box with
 * every offsetParent's offset accumulated up to the stage root. Returns null
 * for boxes that cannot contribute (display:none subtrees, elements whose
 * positioning context escapes the stage).
 */
function layoutRect(el: HTMLElement, stage: HTMLElement): StageRect | null {
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return null;
  let x = el.offsetLeft;
  let y = el.offsetTop;
  let parent = el.offsetParent;
  while (parent instanceof HTMLElement && parent !== stage) {
    if (!stage.contains(parent)) return null;
    x += parent.offsetLeft;
    y += parent.offsetTop;
    parent = parent.offsetParent;
  }
  if (!(parent instanceof HTMLElement)) return null;
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

function clipsOverflow(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  return style.overflowX !== 'visible' || style.overflowY !== 'visible';
}

/**
 * Union of an element's laid-out box and its descendants'. Descendants of an
 * overflow-clipping element (the `.l3-mask` / `.gfx-masked` reveal wrappers)
 * are intersected with that element's box — a masked helper laid out at a
 * negative offset can never grow the union past what the mask lets it paint.
 * Decorative overhangs OUTSIDE any mask (a medallion above the stack, the
 * strap logo hanging 20px below it) extend the union, which is the point:
 * multi-line names and logo-topped variants frame themselves automatically.
 */
function walk(el: HTMLElement, stage: HTMLElement): StageRect | null {
  const own = layoutRect(el, stage);
  if (!own) return null;
  let union = own;
  const clipped = clipsOverflow(el);
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue; // SVG boxes count via their HTML parent
    /**
     * Nodes that exist to be measured, not seen.
     *
     * The theme strap renders a hidden twin of the name to size its plate from.
     * It is `visibility: hidden` and paints nothing, but it is laid out — which
     * is the whole point — so the union counted a box up to 1618px wide at the
     * top-left corner and framed the preview around empty space. An element
     * that cannot paint must not be able to move the frame.
     */
    if (child.dataset.crop === 'ignore') continue;
    let rect = walk(child, stage);
    if (!rect) continue;
    if (clipped) rect = intersectionOf(rect, own);
    if (!rect) continue;
    union = unionOf(union, rect);
  }
  return union;
}

const STAGE_RECT: StageRect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };

/**
 * Measure the rendered graphic's bounds (stage px) inside a `.gfx-stage`
 * element. Walks the graphic layers' laid-out geometry (see MEASUREMENT
 * RULE above) and clamps to the stage — anything laid out off-stage is
 * overflow-hidden by the stage and must not stretch the crop.
 */
export function measureStageContent(stage: HTMLElement): StageRect | null {
  let union: StageRect | null = null;
  for (const layer of Array.from(stage.querySelectorAll(':scope > .gfx-layer'))) {
    for (const child of Array.from(layer.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = walk(child, stage);
      if (!rect) continue;
      union = union ? unionOf(union, rect) : rect;
    }
  }
  if (!union) return null;
  return intersectionOf(union, STAGE_RECT);
}

/**
 * Turn measured content bounds into the bare crop: BARE_MARGIN of breathing
 * room on every side, integer edges (offset reads are integral, so repeated
 * measurements of unchanged content produce an identical crop — the other
 * half of the stability guarantee), a BARE_MIN_CROP floor expanded about the
 * content's centre, everything clamped to the stage.
 */
export function cropFromContent(content: StageRect): StageRect {
  let left = Math.floor(content.x - BARE_MARGIN.x);
  let top = Math.floor(content.y - BARE_MARGIN.y);
  let right = Math.ceil(content.x + content.width + BARE_MARGIN.x);
  let bottom = Math.ceil(content.y + content.height + BARE_MARGIN.y);

  if (right - left < BARE_MIN_CROP.width) {
    const centre = (left + right) / 2;
    left = Math.floor(centre - BARE_MIN_CROP.width / 2);
    right = left + BARE_MIN_CROP.width;
  }
  if (bottom - top < BARE_MIN_CROP.height) {
    const centre = (top + bottom) / 2;
    top = Math.floor(centre - BARE_MIN_CROP.height / 2);
    bottom = top + BARE_MIN_CROP.height;
  }

  // Clamp by shifting before shrinking, so the floor sizes survive at the edges.
  if (left < 0) {
    right = Math.min(right - left, STAGE_WIDTH);
    left = 0;
  }
  if (top < 0) {
    bottom = Math.min(bottom - top, STAGE_HEIGHT);
    top = 0;
  }
  if (right > STAGE_WIDTH) {
    left = Math.max(0, left - (right - STAGE_WIDTH));
    right = STAGE_WIDTH;
  }
  if (bottom > STAGE_HEIGHT) {
    top = Math.max(0, top - (bottom - STAGE_HEIGHT));
    bottom = STAGE_HEIGHT;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}
