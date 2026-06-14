import type { ReactNode } from 'react';

interface SectionHeaderProps {
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  title: string;
  /** Optional right-aligned content (badge, action, status). */
  aside?: ReactNode;
}

/** Consistent panel header: eyebrow + title on the left, optional aside right. */
export default function SectionHeader({ kicker, title, aside }: SectionHeaderProps) {
  return (
    <header className="ll-panel__head">
      <div className="min-w-0">
        {kicker ? <p className="ll-kicker">{kicker}</p> : null}
        <h2 className="ll-title">{title}</h2>
      </div>
      {aside ? <div className="ll-panel__aside">{aside}</div> : null}
    </header>
  );
}
