import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import AccentStripe from '../graphics/AccentStripe';
import MaskedLine from '../graphics/MaskedLine';
import { templateColorStyle } from './colorVars';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

function titleSizeClass(text: string): string {
  if (text.length > 46) return 'event-title-sm';
  if (text.length > 30) return 'event-title-md';
  return '';
}

export default function EventBanner({ values }: Props) {
  const variantId = values.variantId?.trim() || 'festival-stage';
  const eventTitle = values.eventTitle?.trim() || 'Upcoming Event';
  const dateTime = values.dateTime?.trim() || '';
  const location = values.location?.trim() || '';
  const callToAction = values.callToAction?.trim() || '';
  const tag = values.tag?.trim() || 'Event';
  const hasMeta = Boolean(dateTime || location);
  const titleWords = eventTitle.split(/\s+/).filter(Boolean).slice(0, 3);

  return (
    <div className="gfx-event" data-variant={variantId} style={templateColorStyle(values)}>
      <div className="event-shell">
        <div className="event-brand-lockup">
          {titleWords.map((word, index) => (
            <span key={`${word}-${index}`} className="event-brand-word">
              {word}
            </span>
          ))}
          <span className="event-brand-note" aria-hidden />
        </div>
        <Plate fill="ink" className="event-tag">
          <span className="event-tag-dot" aria-hidden />
          <span>{tag}</span>
        </Plate>
        <Plate fill="brand" cut="right" cutDepth={38} className="event-main">
          <AccentStripe orientation="horizontal" thickness={7} color="accent-2" className="event-cap" />
          <h1 className={`event-title ${titleSizeClass(eventTitle)}`.trim()}>
            <MaskedLine index={0}>{eventTitle}</MaskedLine>
          </h1>
          {callToAction ? <p className="event-cta">{callToAction}</p> : null}
        </Plate>
        {hasMeta ? (
          <Plate fill="paper" cut="left" cutDepth={38} className="event-meta">
            {dateTime ? (
              <span className="event-meta-line">
                <span className="event-meta-label">When</span>
                <span className="event-meta-value">{dateTime}</span>
              </span>
            ) : null}
            {location ? (
              <span className="event-meta-line">
                <span className="event-meta-label">Where</span>
                <span className="event-meta-value">{location}</span>
              </span>
            ) : null}
          </Plate>
        ) : null}
      </div>
    </div>
  );
}
