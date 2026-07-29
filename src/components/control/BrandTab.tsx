import type { ReactNode } from 'react';
import BrandControls from './BrandControls';
import BrandEventPack from './BrandEventPack';
import BrandSaveGraphic from './BrandSaveGraphic';
import GraphicOverrides from './GraphicOverrides';

function Section({ letter, title, children }: { letter: string; title: string; children: ReactNode }) {
  return (
    <section className="brand-tab__section">
      <h3 className="brand-tab__title">
        <span className="brand-tab__letter" aria-hidden>
          {letter}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Brand tab layout (studio). Three ordered sections — commit the graphic, see
 * the brand it sits in, then check what has been changed away from that brand.
 *
 * The preview monitor, the Content/Design/Brand tab strip and the Program rail
 * are unchanged; this is the tab BODY only. `BrandControls` is shared with the
 * dock, so the pack switcher is suppressed here (section B owns it, including
 * the read-only rundown-item case) rather than moved out of the shared
 * component — the dock keeps its existing layout untouched.
 */
export default function BrandTab() {
  return (
    <div className="brand-tab">
      <Section letter="A" title="Save this graphic">
        <BrandSaveGraphic />
      </Section>

      <Section letter="B" title="Brand and event pack">
        <BrandEventPack />
        <BrandControls showEventPack={false} />
      </Section>

      <Section letter="C" title="Graphic overrides">
        <GraphicOverrides />
      </Section>
    </div>
  );
}
