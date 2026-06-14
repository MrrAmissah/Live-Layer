import type { CSSProperties } from 'react';

interface MedallionProps {
  /** Logo image; when absent an initials monogram is rendered instead. */
  logoUrl?: string;
  /** Source text for the monogram fallback (e.g. church/org name). */
  monogramSource?: string;
  /** Diameter in stage px. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function initialsFrom(source: string): string {
  const words = source
    .split(/[\s•·|/-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Circular brand seal designed to overlap a plate edge. Renders the logo
 * image when provided, otherwise an initials monogram on an ink disc —
 * never placeholder copy.
 */
export default function Medallion({ logoUrl, monogramSource = '', size = 132, className, style }: MedallionProps) {
  const initials = initialsFrom(monogramSource);
  if (!logoUrl && !initials) return null;

  return (
    <div
      className={`gfx-medallion${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ...style }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="gfx-medallion-img" />
      ) : (
        <span className="gfx-medallion-monogram" style={{ fontSize: size * 0.34 }}>
          {initials}
        </span>
      )}
    </div>
  );
}
