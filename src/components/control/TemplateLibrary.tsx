import { useMemo, useState } from 'react';
import { templateRegistry } from '../templates/registry';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { Icon } from '../../lib/icons';
import TemplateThumb from './TemplateThumb';

/**
 * Template library: searchable, category-grouped compact rows with a real
 * thumbnail and a semantic type icon (no coloured dots). Selection is a
 * restrained tinted surface with a thin accent edge — not a heavy border.
 */
export default function TemplateLibrary({ onAfterSelect }: { onAfterSelect?: () => void }) {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const setTemplate = useLiveLayerStore((state) => state.setTemplate);
  const [query, setQuery] = useState('');
  // Categories roll up from the header chevron. Collapsed-by-name (not by index)
  // so the set survives re-grouping while searching.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (category: string) => setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = q
      ? templateRegistry.filter(
          (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
        )
      : templateRegistry;
    return match.reduce<Record<string, typeof templateRegistry>>((acc, template) => {
      (acc[template.category] ??= []).push(template);
      return acc;
    }, {});
  }, [query]);

  const groups = Object.entries(grouped);

  return (
    <div className="tpl-lib">
      {/* No filter control: the reference shows one, but nothing behind it is
          implemented, and a decorative clickable button is worse than none.
          Add it back with the sort/filter behaviour it implies. */}
      <div className="tpl-lib__searchrow">
        <div className="tpl-lib__search">
          <Icon name="search" size={16} />
          <input
            className="tpl-lib__search-input"
            type="search"
            value={query}
            placeholder="Search templates"
            aria-label="Search templates"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="tpl-lib__scroll" role="radiogroup" aria-label="Choose a graphic">
        {groups.map(([category, items]) => {
          // A search always reveals its hits, so a stale collapse can't hide them.
          const isOpen = !collapsed[category] || query.trim().length > 0;
          const panelId = `tpl-cat-${category.replace(/\s+/g, '-').toLowerCase()}`;
          return (
          <div key={category} className={`tpl-lib__group${isOpen ? '' : ' tpl-lib__group--collapsed'}`}>
            <button
              type="button"
              className="tpl-lib__cat"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(category)}
            >
              <Icon name="chevronDown" size={14} />
              <span className="tpl-lib__cat-name">{category}</span>
              <span className="tpl-lib__cat-rule" aria-hidden />
              <span className="tpl-lib__cat-count">{items.length}</span>
            </button>
            <div id={panelId} className="tpl-lib__cat-items" hidden={!isOpen}>
            {items.map((template) => {
              const active = template.id === currentTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`tpl-row${active ? ' tpl-row--active' : ''}`}
                  onClick={() => {
                    setTemplate(template.id);
                    onAfterSelect?.();
                  }}
                >
                  <TemplateThumb template={template} />
                  <span className="tpl-row__name">{template.name}</span>
                </button>
              );
            })}
            </div>
          </div>
          );
        })}
        {groups.length === 0 ? <p className="tpl-lib__empty">No templates match “{query}”.</p> : null}
      </div>
    </div>
  );
}
