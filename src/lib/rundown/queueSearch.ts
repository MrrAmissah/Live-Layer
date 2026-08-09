import type { RundownItem } from '../../types/rundown';
import { templateLabel } from '../graphicTitle';

/**
 * A search hit keeps the item's ORIGINAL queue position. The dock's Queue tab
 * prints "#3" on a row and Take fires by selection cursor, so a row that
 * renumbered itself under a filter would tell the operator a different running
 * order than the one Take walks.
 */
export interface QueueSearchHit {
  item: RundownItem;
  /** Index in the unfiltered rundown — the number the row displays. */
  index: number;
}

/**
 * Case-insensitive queue search over exactly what a queue row displays: the
 * item title and its template-type label ("Scripture Card", "Lower Third").
 * Searching hidden fields would return rows with no visible reason to match.
 * An empty or whitespace query returns every item, in order.
 */
export function filterRundownItems(items: RundownItem[], query: string): QueueSearchHit[] {
  const q = query.trim().toLowerCase();
  const all = items.map((item, index) => ({ item, index }));
  if (!q) return all;
  return all.filter(
    ({ item }) =>
      item.title.toLowerCase().includes(q) ||
      templateLabel(item.graphic.templateId).toLowerCase().includes(q)
  );
}
