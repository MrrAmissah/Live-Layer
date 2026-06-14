import type { ReactNode } from 'react';

interface PanelProps {
  /** Extra classes (e.g. grid-area assignment). */
  className?: string;
  /** When true the panel has no inner body padding (caller owns layout). */
  flush?: boolean;
  children: ReactNode;
}

/**
 * Control-surface panel. Sharp graphite card with a subtle edge — the single
 * surface primitive every control panel sits on, so the whole dock reads as
 * one cohesive broadcast instrument rather than a stack of web cards.
 */
export default function Panel({ className, flush, children }: PanelProps) {
  return (
    <section className={`ll-panel ${flush ? 'll-panel--flush' : ''} ${className ?? ''}`.trim()}>
      {children}
    </section>
  );
}
