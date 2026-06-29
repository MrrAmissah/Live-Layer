import { useEffect, useState } from 'react';
import type { TemplateDefinition } from '../../types/graphics';
import Plate from '../graphics/Plate';
import AccentStripe from '../graphics/AccentStripe';
import Medallion from '../graphics/Medallion';
import MaskedLine from '../graphics/MaskedLine';
import { useAsset } from '../../hooks/useAsset';

interface Props {
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
}

/**
 * Step the name size down as it gets longer so a long-but-realistic name (e.g.
 * a 24-char two-word name) reads as a nameplate, not a headline, and the line
 * stays inside title-safe. Four graduated tiers instead of one big 72->58 jump.
 */
function nameSizeClass(name: string): string {
  const n = name.length;
  if (n > 28) return 'l3-name-sm';
  if (n > 22) return 'l3-name-md';
  if (n > 16) return 'l3-name-lg';
  return '';
}

/**
 * Speaker lower third.
 *
 * Anchored to the lower-left title-safe corner of the 1920x1080 stage.
 * Layered construction: brand-deep underbar -> brand name plate with a 12deg
 * right end-cut -> ink role strip -> accent stripe on the left seam ->
 * brand medallion overlapping the left edge. All fills are opaque; colors
 * come from the stage-scoped --gfx-* theme variables.
 */
export default function PreacherLowerThird({ values }: Props) {
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const variantId = values.variantId?.trim() || 'signature-medallion';
  const name = values.name?.trim() || 'Speaker Name';
  const title = values.title?.trim() || '';
  const subtitle = values.subtitle?.trim() || '';
  const logoAssetId = values.logoAssetId?.trim() || undefined;
  const logoUrl = values.logoUrl?.trim() || undefined;
  const preResolvedLogo = values.logoResolvedSrc?.trim() || undefined;
  const headshotAssetId = values.headshotAssetId?.trim() || undefined;
  const preResolvedHeadshot = values.headshotResolvedSrc?.trim() || undefined;
  const asset = useAsset(preResolvedLogo ? undefined : logoAssetId);
  const headshot = useAsset(preResolvedHeadshot ? undefined : headshotAssetId);
  const resolvedLogo = preResolvedLogo || (asset.status === 'ready' ? asset.src : logoUrl);
  const resolvedHeadshot = preResolvedHeadshot || (headshot.status === 'ready' ? headshot.src : undefined);
  const showHeadshot = Boolean(resolvedHeadshot && !headshotFailed);
  const hasRoleRow = Boolean(title || subtitle);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [resolvedHeadshot]);

  return (
    <div className="gfx-l3" data-variant={variantId} data-logo={resolvedLogo ? 'true' : 'false'}>
      <div className="l3-stack">
        <div className="l3-underbar" aria-hidden />
        <div className="l3-symbol-block" aria-hidden>
          <span className="l3-symbol-mark" />
        </div>
        <div className="l3-mask">
          <Plate fill="brand" cut="right" cutDepth={22} className="l3-name-plate">
            <span className="l3-cap" aria-hidden />
            <h1 className={`l3-name ${nameSizeClass(name)}`.trim()}>
              <MaskedLine index={0}>{name}</MaskedLine>
            </h1>
          </Plate>
        </div>
        {hasRoleRow ? (
          <div className="l3-mask l3-role-mask">
            <Plate fill="ink" cut="right" cutDepth={10} className="l3-role-plate">
              <MaskedLine index={1} className="l3-role-line-mask">
                <span className="l3-role-line">
                  {title ? <span className="l3-role">{title}</span> : null}
                  {title && subtitle ? <span className="l3-role-divider" aria-hidden /> : null}
                  {subtitle ? <span className="l3-org">{subtitle}</span> : null}
                </span>
              </MaskedLine>
            </Plate>
          </div>
        ) : null}
        <AccentStripe className="l3-stripe" thickness={14} color="accent-2" />
        <span className="l3-end-slab" aria-hidden />
      </div>
      {showHeadshot ? (
        <div className="l3-headshot">
          <img src={resolvedHeadshot} alt="" className="l3-headshot__img" onError={() => setHeadshotFailed(true)} />
        </div>
      ) : null}
      <Medallion className="l3-medallion" logoUrl={resolvedLogo} monogramSource={subtitle || name} size={150} />
    </div>
  );
}
