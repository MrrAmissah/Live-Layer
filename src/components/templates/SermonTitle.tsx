import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import AccentStripe from '../graphics/AccentStripe';
import MaskedLine from '../graphics/MaskedLine';
import { templateColorStyle } from './colorVars';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

function sermonTitleSizeClass(text: string): string {
  if (text.length > 58) return 'sermon-title-sm';
  if (text.length > 36) return 'sermon-title-md';
  return '';
}

export default function SermonTitle({ values }: Props) {
  const variantId = values.variantId?.trim() || 'sermon-paper';
  const sermonTitle = values.sermonTitle?.trim() || 'Sermon Title';
  const speakerName = values.speakerName?.trim() || '';
  const churchName = values.churchName?.trim() || '';
  const seriesTitle = values.seriesTitle?.trim() || '';
  const scriptureReference = values.scriptureReference?.trim() || '';
  const date = values.date?.trim() || '';
  const logoSrc = values.logoResolvedSrc?.trim() || values.logoUrl?.trim() || '';

  return (
    <div className="gfx-sermon" data-variant={variantId} style={templateColorStyle(values)}>
      {logoSrc ? <img src={logoSrc} alt="" className="sermon-logo" draggable={false} /> : null}
      <div className="sermon-frame">
        <AccentStripe orientation="horizontal" thickness={10} color="accent-2" className="sermon-top-rule" />
        <div className="sermon-main">
          {seriesTitle ? <span className="sermon-series">{seriesTitle}</span> : null}
          <h1 className={`sermon-title ${sermonTitleSizeClass(sermonTitle)}`.trim()}>
            <MaskedLine index={0}>{sermonTitle}</MaskedLine>
          </h1>
          {scriptureReference ? (
            <Plate fill="ink" className="sermon-reference">
              <span>{scriptureReference}</span>
            </Plate>
          ) : null}
        </div>
        <div className="sermon-footer">
          <div className="sermon-speaker">
            {speakerName ? <span className="sermon-speaker-name">{speakerName}</span> : null}
            {churchName ? <span className="sermon-church">{churchName}</span> : null}
          </div>
          {date ? <span className="sermon-date">{date}</span> : null}
        </div>
      </div>
    </div>
  );
}
