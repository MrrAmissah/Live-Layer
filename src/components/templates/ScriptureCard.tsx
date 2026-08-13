import type { TemplateDefinition } from '../../types/graphics';
import { resolveGraphicReadiness, SCRIPTURE_TEMPLATE_ID } from '../../lib/graphicReadiness';
import Plate from '../graphics/Plate';
import MaskedLine from '../graphics/MaskedLine';
import { templateColorStyle } from './colorVars';

/**
 * The variant this renderer paints when a graphic names none. Exported so
 * `templateFallbackVariant` can key it by template, and anything describing what
 * a graphic looks like reads that rather than `defaultValues.variantId` — the two
 * differ wherever a renderer is shared by more than one template.
 */
export const DEFAULT_VARIANT_ID = 'blue-quote-card';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

/**
 * Step the verse size to the passage, so it never blows past the card.
 *
 * The steps are bands, and each layout decides what a band MEANS in its own
 * stylesheet — a size that fills a 740px measure is lost in a 984px one. What
 * this function owns is only where the bands sit.
 *
 * `xl` is the band that makes `split-tall` work. Without it the base band spans
 * 0–130 characters, so it has to be sized for 130 — and a 59-character verse,
 * which is most of them, then fills a third of a card that scripture is
 * supposed to own. Variants that do not style `xl` simply inherit their base
 * size, so this is additive.
 */
function verseSizeClass(text: string): string {
  if (text.length > 220) return 'scripture-verse-sm';
  if (text.length > 130) return 'scripture-verse-md';
  if (text.length > 72) return '';
  return 'scripture-verse-xl';
}

/**
 * Scripture overlay.
 *
 * Full-bleed `lower-band` composition modeled on the on-air sermon reference:
 * an ink reference tab clipped above the top-left of a full-width opaque paper
 * plate that carries the verse in dark ink, with the translation label as the
 * single tracked-out element at the right end. All fills are opaque so the
 * verse stays readable over any camera feed; colors come from the stage-scoped
 * --gfx-* theme variables (theme prop is applied at the stage root, not here).
 */
export default function ScriptureCard({ values }: Props) {
  const variantId = values.variantId?.trim() || DEFAULT_VARIANT_ID;
  const reference = values.reference?.trim() ?? '';
  const verseText = values.verseText?.trim() ?? '';
  const translationLabel = values.translationLabel?.trim() || '';
  const themeTitle = values.themeTitle?.trim() || '';
  const { ready, reason } = resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, values);

  /**
   * An incomplete card shows that it is incomplete. It does not invent content.
   *
   * These two fields used to fall back to `'Scripture'` and to the words of
   * Psalm 23 — so a card nobody had filled in rendered as a real, unattributed
   * passage, indistinguishable on a stream from one the operator chose. The
   * fabricated text is gone, and the same rule that decides this
   * (`resolveGraphicReadiness`) also gates Take, so what cannot air cannot be
   * previewed as if it could.
   *
   * The placeholder is deliberately not styled as a graphic: no plate, no verse
   * type, nothing that could read as content if it ever reached a scene. It
   * exists so the operator sees an obviously unfinished card in Preview rather
   * than an empty rectangle they might mistake for a rendering fault.
   */
  if (!ready) {
    // Palette vars stay: the renderer contract is that a carried
    // --gfx-template-* value is declared on the root, and that is theming, not
    // content — so the placeholder honours it like every other branch.
    return (
      <div
        className="gfx-scripture gfx-scripture--empty"
        data-variant={variantId}
        data-empty="true"
        style={templateColorStyle(values)}
      >
        <span className="scripture-empty">{reason}</span>
      </div>
    );
  }

  return (
    <div className="gfx-scripture" data-variant={variantId} style={templateColorStyle(values)}>
      <div className="scripture-band">
        <Plate fill="ink" className="scripture-tab">
          <span className="scripture-tab-accent" aria-hidden />
          <span className="scripture-tab-body">
            <span className="scripture-ref">{reference}</span>
            {themeTitle ? <span className="scripture-theme-chip">{themeTitle}</span> : null}
          </span>
        </Plate>
        <Plate fill="paper" className="scripture-plate">
          <span className="scripture-rule" aria-hidden />
          <p className={`scripture-verse ${verseSizeClass(verseText)}`.trim()}>
            <MaskedLine index={1}>{verseText}</MaskedLine>
          </p>
          {translationLabel ? <span className="scripture-translation">{translationLabel}</span> : null}
        </Plate>
      </div>
    </div>
  );
}
