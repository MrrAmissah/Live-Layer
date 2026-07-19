import type { TemplateDefinition, TemplateDisplayCategory } from '../types/graphics';
import type { IconName } from './icons';

const CATEGORY_TO_DISPLAY: Record<string, TemplateDisplayCategory> = {
  'lower third': 'lowerThird',
  card: 'card',
  banner: 'banner',
  fullscreen: 'fullscreen'
};

/**
 * Normalized class for icons and grouping. Prefers an explicit
 * `displayCategory`, else infers from the free-text `category` label, else
 * falls back to 'card'.
 */
export function getTemplateDisplayCategory(template: TemplateDefinition): TemplateDisplayCategory {
  if (template.displayCategory) return template.displayCategory;
  return CATEGORY_TO_DISPLAY[template.category.trim().toLowerCase()] ?? 'card';
}

/**
 * Semantic icon for a template — used on library rows and queue entries so
 * types are distinguishable without coloured dots. Scripture and quote both
 * live under the 'card' display category but read as book vs quote marks.
 */
export function getTemplateIcon(template: TemplateDefinition): IconName {
  if (template.id === 'scripture-card') return 'book';
  if (template.id === 'quote-card') return 'quote';
  switch (getTemplateDisplayCategory(template)) {
    case 'lowerThird':
      return 'type';
    case 'banner':
      return 'megaphone';
    case 'fullscreen':
      return 'message';
    default:
      return 'quote';
  }
}
