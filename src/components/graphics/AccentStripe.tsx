import type { CSSProperties } from 'react';

interface AccentStripeProps {
  orientation?: 'vertical' | 'horizontal';
  /** Stripe thickness in stage px. Standard weights: 6 or 12. */
  thickness?: number;
  color?: 'accent-2' | 'brand' | 'brand-deep' | 'paper';
  className?: string;
  style?: CSSProperties;
}

const COLOR_VARS = {
  'accent-2': 'var(--gfx-accent-2)',
  brand: 'var(--gfx-brand)',
  'brand-deep': 'var(--gfx-brand-deep)',
  paper: 'var(--gfx-paper)'
} as const;

/** Thin solid accent bar used to edge or underline a plate composition. */
export default function AccentStripe({
  orientation = 'vertical',
  thickness = 12,
  color = 'accent-2',
  className,
  style
}: AccentStripeProps) {
  const size: CSSProperties =
    orientation === 'vertical' ? { width: thickness, height: '100%' } : { height: thickness, width: '100%' };
  return (
    <div
      aria-hidden
      className={`gfx-stripe${className ? ` ${className}` : ''}`}
      style={{ backgroundColor: COLOR_VARS[color], ...size, ...style }}
    />
  );
}
