import type { CSSProperties, ReactNode } from 'react';

export type PlateFill = 'brand' | 'brand-deep' | 'ink' | 'paper';
export type PlateCut = 'none' | 'right' | 'left';

const FILL_VARS: Record<PlateFill, string> = {
  brand: 'var(--gfx-brand)',
  'brand-deep': 'var(--gfx-brand-deep)',
  ink: 'var(--gfx-ink)',
  paper: 'var(--gfx-paper)'
};

interface PlateProps {
  fill: PlateFill;
  /** Diagonal end-cut. `cutDepth` is the horizontal offset in px (≈ tan(12deg) * plate height for the standard angle). */
  cut?: PlateCut;
  cutDepth?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

function cutPath(cut: PlateCut, depth: number): string | undefined {
  if (cut === 'right') {
    // Forward lean: top edge overhangs the bottom at the right end.
    return `polygon(0 0, 100% 0, calc(100% - ${depth}px) 100%, 0 100%)`;
  }
  if (cut === 'left') {
    return `polygon(${depth}px 0, 100% 0, 100% 100%, 0 100%)`;
  }
  return undefined;
}

/**
 * Opaque broadcast panel. No translucency, no border-radius — text always
 * sits on a solid fill so it stays readable over any camera feed.
 */
export default function Plate({ fill, cut = 'none', cutDepth = 20, className, style, children }: PlateProps) {
  return (
    <div
      className={`gfx-plate${className ? ` ${className}` : ''}`}
      style={{
        backgroundColor: FILL_VARS[fill],
        clipPath: cutPath(cut, cutDepth),
        ...style
      }}
    >
      {children}
    </div>
  );
}
