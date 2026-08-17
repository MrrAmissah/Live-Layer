import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import AccentStripe from '../graphics/AccentStripe';
import Medallion from '../graphics/Medallion';
import MaskedLine from '../graphics/MaskedLine';
import { useAsset } from '../../hooks/useAsset';
import { CONVENTION_LOGO_URL, DEFAULT_CHURCH_LOGO_URL } from '../../lib/brandAssets';
import { templateColorStyle } from './colorVars';
import { STRAP_NAME_MAX_PX, fitStrapName, type StrapFit } from '../../lib/strapPlate';

/**
 * The variant this renderer paints when a graphic names none. Exported so
 * `templateFallbackVariant` can key it by template: BOTH lower thirds render
 * through here, so a performer graphic that stores no variant falls back to this
 * preacher default rather than to its own `defaultValues.variantId`.
 */
/**
 * What this renderer paints when a graphic names no variant.
 *
 * DELIBERATELY NOT the preacher default, which is now `modern-minimal`. The two
 * answer different questions: the registry default is what a NEW graphic starts
 * as, and this is what an EXISTING one paints when it stored no variant at all.
 *
 * Moving this with the default was tried and reverted. It is shared with
 * `performer-lower-third` and sits at the head of the logo-resolution chain, so
 * changing it repaints saved graphics on both templates and alters which logo
 * the renderer selects for them — a wide change, made in passing, for something
 * nobody asked for. (There IS a real oddity here: `signature-medallion` is not
 * in the performer variant list, so a performer graphic with no variant paints a
 * design its own template does not offer. Worth fixing on purpose, with the
 * logo chain in view, and not five days before a convention.)
 */
export const DEFAULT_VARIANT_ID = 'signature-medallion';

/**
 * Variants whose medallion the stylesheet actually shows.
 *
 * The medallion is in the markup for every variant, but `styles.css` hides it
 * (`.gfx-l3:not([data-variant='signature-medallion']) .l3-medallion { display:none }`)
 * and individual variants switch it back on. This list is the cascade's real
 * answer, measured with `getComputedStyle` across all 15 variants, and
 * `logoFallback.test.ts` re-derives it from the stylesheet so it cannot drift.
 */
const MEDALLION_VARIANTS = new Set([
  'signature-medallion',
  /* The seal at the left of the ministering band — see `headshot-band` in the
     stylesheet, which switches it back on. */
  'headshot-band',
  'clean-broadcast',
  'split-bar',
  'event-style',
  'canva-host-bar',
  'canva-celebration',
  'canva-ministry',
  'soft-broadcast',
  'performer-pill',
  'performer-note'
]);

/**
 * The logo this renderer paints when the graphic names none — its own rule, so
 * nothing else has to know these URLs.
 *
 * `resolvedLogo` falls back to the house logo unconditionally, so any variant
 * that SHOWS the medallion paints it; `convention-strap` hides the medallion and
 * draws the strap image instead, whose own fallback is the event logo; and a
 * variant that shows neither paints no logo at all.
 */
export function logoFallbackForVariant(variantId: string | undefined): string | undefined {
  const variant = variantId?.trim() || DEFAULT_VARIANT_ID;
  if (variant === 'convention-strap') return CONVENTION_LOGO_URL;
  return MEDALLION_VARIANTS.has(variant) ? DEFAULT_CHURCH_LOGO_URL : undefined;
}

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

/* The convention strap is an event graphic — falling back to the church logo
   there puts the wrong brand on a conference frame, so it gets the event
   logo instead when the operator hasn't set one. */

/**
 * Step the name size down as it gets longer so a long-but-realistic name (e.g.
 * a 24-char two-word name) reads as a nameplate, not a headline, and the line
 * stays inside title-safe. Four graduated tiers instead of one big 72->58 jump.
 */
function nameSizeClass(name: string): string {
  const n = name.length;
  // A fifth tier, because the names this church actually uses reach it:
  // "Rev. Dr. Emmanuel Kwabena Owusu-Ansah" is 37 characters, and at 44px it
  // needed a plate wider than the frame. Stepping down is what keeps the last
  // resort — a hard cut mid-word — out of reach.
  if (n > 34) return 'l3-name-xs';
  if (n > 28) return 'l3-name-sm';
  if (n > 22) return 'l3-name-md';
  if (n > 16) return 'l3-name-lg';
  return '';
}

/**
 * The strap's name width, measured rather than estimated.
 *
 * A hidden twin of the name is rendered at the full 62px with the same classes,
 * so it inherits the same family, weight, stretch, tracking and uppercasing from
 * the stylesheet. Measuring the LIVE node instead would read a width that has
 * already been fitted — and normalising that back out means trusting the very
 * proportion the measurement exists to check.
 *
 * Re-measures when fonts land: Archivo arriving after first paint changes the
 * width, and a plate chosen from the fallback font's metrics would be the wrong
 * plate for the rest of the take.
 */
function useStrapFit(name: string, active: boolean): { ref: React.RefObject<HTMLSpanElement>; fit: StrapFit } {
  const ref = useRef<HTMLSpanElement>(null);
  const [natural, setNatural] = useState(0);

  const measure = () => {
    const node = ref.current;
    if (!node) return;
    /**
     * `offsetWidth`, NOT `getBoundingClientRect()`.
     *
     * The rect is in painted pixels, so it comes back multiplied by whatever
     * transform the stage is under — and the control surface renders this same
     * renderer inside a scaled 1920x1080 preview. Measuring there would have
     * returned a fraction of the true width and selected the compact plate for
     * every name, while /output at full size selected correctly. A defect
     * visible only in the preview, which is where the operator judges it.
     *
     * `offsetWidth` is layout pixels and ignores transforms, so both surfaces
     * measure the same name the same way.
     */
    setNatural(node.offsetWidth);
  };

  // Before paint, so the plate is never seen changing under the name.
  useLayoutEffect(() => {
    if (active) measure();
    else setNatural(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, name]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, name]);

  return { ref, fit: fitStrapName(natural) };
}

/**
 * Same idea for the role bar: a long title+org combo ("Founder & Senior
 * Teaching Pastor" + a full church name) steps down before the ellipsis
 * fallback ever cuts it off mid-word on air.
 */
function roleFit(title: string, subtitle: string): string | undefined {
  const n = title.length + subtitle.length;
  if (n > 56) return 'sm';
  if (n > 42) return 'md';
  return undefined;
}

/**
 * Speaker lower third.
 *
 * Anchored to the lower-left title-safe corner of the 1920x1080 stage.
 * Layered construction: brand-deep underbar -> brand name plate with a 12deg
 * right end-cut -> ink role strip -> accent stripe on the left seam ->
 * brand medallion overlapping the left edge. All fills are opaque; colors
 * come from the stage-scoped --gfx-* theme variables.
 */
export default function PreacherLowerThird({ values }: Props) {
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const variantId = values.variantId?.trim() || DEFAULT_VARIANT_ID;
  const name = values.name?.trim() || 'Speaker Name';
  const title = values.title?.trim() || '';
  const subtitle = values.subtitle?.trim() || '';
  const logoAssetId = values.logoAssetId?.trim() || undefined;
  const logoUrl = values.logoUrl?.trim() || undefined;
  const preResolvedLogo = values.logoResolvedSrc?.trim() || undefined;
  const headshotAssetId = values.headshotAssetId?.trim() || undefined;
  const preResolvedHeadshot = values.headshotResolvedSrc?.trim() || undefined;
  const asset = useAsset(preResolvedLogo ? undefined : logoAssetId);
  const headshot = useAsset(preResolvedHeadshot ? undefined : headshotAssetId);
  const resolvedLogo = preResolvedLogo || (asset.status === 'ready' ? asset.src : logoUrl) || DEFAULT_CHURCH_LOGO_URL;
  const explicitLogo = preResolvedLogo || (asset.status === 'ready' ? asset.src : logoUrl);
  const strapLogo = explicitLogo && explicitLogo !== DEFAULT_CHURCH_LOGO_URL ? explicitLogo : CONVENTION_LOGO_URL;
  const resolvedHeadshot = preResolvedHeadshot || (headshot.status === 'ready' ? headshot.src : undefined);
  const showHeadshot = Boolean(resolvedHeadshot && !headshotFailed);
  const hasRoleRow = Boolean(title || subtitle);
  const isStrap = variantId === 'strap-type';
  const { ref: strapMeasureRef, fit: strapFit } = useStrapFit(name, isStrap);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [resolvedHeadshot]);

  return (
    <div
      className="gfx-l3"
      data-variant={variantId}
      data-logo={resolvedLogo ? 'true' : 'false'}
      data-role-fit={roleFit(title, subtitle)}
      data-strap-plate={isStrap ? strapFit.plate.id : undefined}
      style={{
        ...templateColorStyle(values),
        /* The role's cap follows the plate the NAME chose. Hardcoding the
           narrowest here would truncate a role at 850 even on a wide plate —
           the old bug behind new wiring. */
        ...(isStrap ? ({ '--l3-strap-zone': `${strapFit.plate.zone}px` } as React.CSSProperties) : null)
      }}
    >
      {isStrap ? (
        <>
          {/* The plate IS the graphic now: it enters, sits and clears with the
              type because it is inside the same element the take shows and
              hides. Full-frame at the output's native size, so the artwork's
              own coordinates need no offset. */}
          <img className="l3-strap-plate" src={strapFit.plate.src} alt="" draggable={false} />
          <span className="l3-name l3-strap-measure" aria-hidden ref={strapMeasureRef}>
            {name}
          </span>
        </>
      ) : null}
      <div className="l3-stack">
        <div className="l3-underbar" aria-hidden />
        <div className="l3-symbol-block" aria-hidden>
          <span className="l3-symbol-mark" />
        </div>
        <div className="l3-mask">
          <Plate fill="brand" cut="right" cutDepth={22} className="l3-name-plate">
            <span className="l3-cap" aria-hidden />
            {/* The strap fits CONTINUOUSLY, so it takes no size class: the
                tiers exist only for variants that cannot know their own width,
                and having both would be two mechanisms disagreeing at different
                specificities — the fault that hard-cut a name twice already. */}
            <h1
              className={`l3-name ${isStrap ? '' : nameSizeClass(name)}`.trim()}
              style={isStrap && strapFit.size < STRAP_NAME_MAX_PX ? { fontSize: `${strapFit.size}px` } : undefined}
            >
              <MaskedLine index={0}>{name}</MaskedLine>
            </h1>
          </Plate>
        </div>
        {hasRoleRow ? (
          <div className="l3-mask l3-role-mask">
            <Plate fill="ink" cut="right" cutDepth={10} className="l3-role-plate">
              <MaskedLine index={1} className="l3-role-line-mask">
                <span className="l3-role-line">
                  {title ? <span className="l3-role">{title}</span> : null}
                  {title && subtitle ? <span className="l3-role-divider" aria-hidden /> : null}
                  {subtitle ? <span className="l3-org">{subtitle}</span> : null}
                </span>
              </MaskedLine>
            </Plate>
          </div>
        ) : null}
        <AccentStripe className="l3-stripe" thickness={14} color="accent-2" />
        <span className="l3-end-slab" aria-hidden />
      </div>
      {showHeadshot ? (
        <div className="l3-headshot">
          <img src={resolvedHeadshot} alt="" className="l3-headshot__img" onError={() => setHeadshotFailed(true)} />
        </div>
      ) : null}
      <Medallion className="l3-medallion" logoUrl={resolvedLogo} monogramSource={subtitle || name} size={150} />
      {variantId === 'convention-strap' ? (
        <img src={strapLogo} alt="" className="l3-strap-logo" draggable={false} />
      ) : null}
    </div>
  );
}
