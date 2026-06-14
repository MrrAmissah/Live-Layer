import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import MaskedLine from '../graphics/MaskedLine';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

/** Step the verse size down for long passages so it never blows past ~3 lines. */
function verseSizeClass(text: string): string {
  if (text.length > 220) return 'scripture-verse-sm';
  if (text.length > 130) return 'scripture-verse-md';
  return '';
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
  const reference = values.reference?.trim() || 'Scripture';
  const verseText = values.verseText?.trim() || 'The Lord is my shepherd; I shall not want.';
  const translationLabel = values.translationLabel?.trim() || '';
  const themeTitle = values.themeTitle?.trim() || '';

  return (
    <div className="gfx-scripture">
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
