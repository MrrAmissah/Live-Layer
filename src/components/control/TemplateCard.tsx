import type { TemplateDefinition } from '../../types/graphics';

interface TemplateCardProps {
  template: TemplateDefinition;
  active: boolean;
  onSelect: () => void;
}

/**
 * A template as a radio option: a selection dot, the graphic's name, and its
 * category. Deliberately light on text — no description, no "selected" label —
 * so the rail scans fast and the choice is obvious at a glance.
 */
export default function TemplateCard({ template, active, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`tpl-card ${active ? 'tpl-card--active' : ''}`}
    >
      <span className="tpl-card__radio" aria-hidden />
      <span className="tpl-card__text">
        <span className="tpl-card__name">{template.name}</span>
        <span className="tpl-card__cat">{template.category}</span>
      </span>
    </button>
  );
}
