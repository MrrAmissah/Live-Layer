import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import MaskedLine from '../graphics/MaskedLine';
import { templateColorStyle } from './colorVars';

/**
 * The variant this renderer paints when a graphic names none. Exported so
 * `templateFallbackVariant` can key it by template, and anything describing what
 * a graphic looks like reads that rather than `defaultValues.variantId` — the two
 * differ wherever a renderer is shared by more than one template.
 */
export const DEFAULT_VARIANT_ID = 'quote-gradient';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

function quoteSizeClass(text: string): string {
  if (text.length > 260) return 'quote-text-sm';
  if (text.length > 170) return 'quote-text-md';
  return '';
}

export default function QuoteCard({ values }: Props) {
  const variantId = values.variantId?.trim() || DEFAULT_VARIANT_ID;
  const quoteText = values.quoteText?.trim() || 'Grace makes room for people to come alive again.';
  const sourceName = values.sourceName?.trim() || '';
  const sourceRole = values.sourceRole?.trim() || '';
  const themeTitle = values.themeTitle?.trim() || 'Quote';
  const translationLabel = values.translationLabel?.trim() || '';
  const hasSource = Boolean(sourceName || sourceRole);

  return (
    <div className="gfx-quote" data-variant={variantId} style={templateColorStyle(values)}>
      <Plate fill="paper" cut="right" cutDepth={54} className="quote-card">
        <span className="quote-mark" aria-hidden>
          &ldquo;
        </span>
        <div className="quote-content">
          <div className="quote-kicker-row">
            <span className="quote-kicker">{themeTitle}</span>
            {translationLabel ? <span className="quote-chip">{translationLabel}</span> : null}
          </div>
          <p className={`quote-text ${quoteSizeClass(quoteText)}`.trim()}>
            <MaskedLine index={0}>{quoteText}</MaskedLine>
          </p>
          {hasSource ? (
            <div className="quote-source">
              <span className="quote-source-rule" aria-hidden />
              <span className="quote-source-copy">
                {sourceName ? <span className="quote-source-name">{sourceName}</span> : null}
                {sourceRole ? <span className="quote-source-role">{sourceRole}</span> : null}
              </span>
            </div>
          ) : null}
        </div>
      </Plate>
    </div>
  );
}
