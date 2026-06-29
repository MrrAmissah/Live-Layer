import type { TemplateDefinition } from '../../types/graphics';

interface TemplateCardProps {
  template: TemplateDefinition;
  active: boolean;
  onSelect: () => void;
}

/**
 * A template as a radio option. The category is already provided by the group
 * heading, so each row stays quiet: name, short purpose, and an active edge.
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
      <span className="tpl-card__text">
        <span className="tpl-card__name">{template.name}</span>
        <span className="tpl-card__desc">{template.description}</span>
      </span>
    </button>
  );
}
