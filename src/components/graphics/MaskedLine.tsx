import type { CSSProperties, ReactNode } from 'react';

interface MaskedLineProps {
  /** Stagger order; each step adds 60ms to the reveal delay. */
  index?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Overflow-hidden line wrapper for broadcast text reveals. The inner element
 * rises from below its own mask when the parent `.gfx-layer` enters
 * (`data-state="in"`), staggered by `--gfx-line-index`.
 */
export default function MaskedLine({ index = 0, className, style, children }: MaskedLineProps) {
  return (
    <span className={`gfx-masked${className ? ` ${className}` : ''}`} style={style}>
      <span className="gfx-masked-inner" style={{ '--gfx-line-index': index } as CSSProperties}>
        {children}
      </span>
    </span>
  );
}
