import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import AccentStripe from '../graphics/AccentStripe';
import MaskedLine from '../graphics/MaskedLine';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

/** Step the headline size down for long titles so it stays inside title-safe. */
function headlineSizeClass(text: string): string {
  if (text.length > 40) return 'announce-headline-sm';
  if (text.length > 24) return 'announce-headline-md';
  return '';
}

/**
 * Announcement banner.
 *
 * Full-bleed `lower-band` composition: a brand plate carrying the headline and
 * a single body line, a paper end-plate with a diagonal left cut holding the
 * date/time at the right (the white-end-plate reference pattern), and an
 * optional call-to-action on an opaque ink chip with an accent-2 keyline
 * beneath. Opaque fills throughout; colors come from the stage-scoped --gfx-*
 * theme variables (theme prop is applied at the stage root, not here).
 */
export default function AnnouncementBanner({ values }: Props) {
  const headline = values.headline?.trim() || 'Announcement';
  const body = values.body?.trim() || '';
  const dateTime = values.dateTime?.trim() || '';
  const callToAction = values.callToAction?.trim() || '';

  return (
    <div className="gfx-announce">
      <div className="announce-row">
        <Plate fill="brand" className="announce-main">
          <AccentStripe orientation="horizontal" thickness={8} color="accent-2" className="announce-rail" />
          <h1 className={`announce-headline ${headlineSizeClass(headline)}`.trim()}>
            <MaskedLine index={0}>{headline}</MaskedLine>
          </h1>
          {body ? <p className="announce-body">{body}</p> : null}
        </Plate>
        {dateTime ? (
          <Plate fill="paper" cut="left" cutDepth={40} className="announce-date">
            <span className="announce-date-accent" aria-hidden />
            <span className="announce-when">When</span>
            <span className="announce-datetime">
              <MaskedLine index={1}>{dateTime}</MaskedLine>
            </span>
          </Plate>
        ) : null}
      </div>
      {callToAction ? (
        <Plate fill="ink" className="announce-cta">
          <span className="announce-cta-text">{callToAction}</span>
        </Plate>
      ) : null}
    </div>
  );
}
