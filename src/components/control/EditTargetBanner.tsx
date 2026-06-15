import { useEditTarget } from '../../hooks/useEditTarget';

/**
 * Tells the operator what the editors are targeting. Shown only in rundown-item
 * mode (the ad-hoc flow stays uncluttered). When the edited item is also live,
 * it states the key rule: editing updates the preview only — Take selected again
 * to update `/output`.
 */
export default function EditTargetBanner() {
  const { isRundownItem, isLive, sourceLabel } = useEditTarget();
  if (!isRundownItem) return null;

  return (
    <div className="edit-banner" role="status">
      <div className="edit-banner__row">
        <span className="edit-banner__tag">Editing rundown item</span>
        <span className="edit-banner__name" title={sourceLabel}>{sourceLabel}</span>
      </div>
      <span className="edit-banner__note">
        Ad-hoc draft preserved.{isLive ? ' This item is live — press Take selected again to update the output.' : ''}
      </span>
    </div>
  );
}
