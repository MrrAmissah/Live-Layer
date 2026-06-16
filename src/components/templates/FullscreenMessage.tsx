import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import MaskedLine from '../graphics/MaskedLine';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

function headlineSizeClass(text: string): string {
  if (text.length > 34) return 'fullmsg-headline-sm';
  if (text.length > 20) return 'fullmsg-headline-md';
  return '';
}

export default function FullscreenMessage({ values }: Props) {
  const headline = values.headline?.trim() || 'Welcome';
  const body = values.body?.trim() || '';
  const footerNote = values.footerNote?.trim() || '';
  const callToAction = values.callToAction?.trim() || '';

  return (
    <div className="gfx-fullmsg">
      <Plate fill="brand" className="fullmsg-panel">
        <span className="fullmsg-accent-block" aria-hidden />
        <div className="fullmsg-content">
          <h1 className={`fullmsg-headline ${headlineSizeClass(headline)}`.trim()}>
            <MaskedLine index={0}>{headline}</MaskedLine>
          </h1>
          {body ? <p className="fullmsg-body">{body}</p> : null}
          {callToAction ? (
            <Plate fill="paper" className="fullmsg-cta">
              <span>{callToAction}</span>
            </Plate>
          ) : null}
        </div>
        {footerNote ? <span className="fullmsg-footer">{footerNote}</span> : null}
      </Plate>
    </div>
  );
}
