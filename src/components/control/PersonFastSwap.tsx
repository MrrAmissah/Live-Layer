import { useEffect, useMemo, useState } from 'react';
import { listPeople, markPersonUsed } from '../../lib/people/peopleStore';
import { personFieldPatch, supportsPerson } from '../../lib/people/personPatch';
import { useEditTarget } from '../../hooks/useEditTarget';
import { Icon } from '../../lib/icons';
import type { PersonProfile } from '../../types/people';

/**
 * Swap the person on the graphic in front of you, in one tap.
 *
 * The commonest last-second change in a service is that the speaker is not who
 * the rundown says. Everything needed for that already existed — People stores
 * the identities, the lower thirds render them — and nothing connected the two
 * anywhere an operator stands during a service.
 *
 * TARGET SAFETY, which is the whole risk in this component.
 *
 * It writes through `useEditTarget().setFields`, and only through that. When a
 * rundown item is selected, that routes to `updateItem` and edits the item;
 * with no selection it edits the ad-hoc draft. The routing is not re-decided
 * here, so this cannot write to the wrong one.
 *
 * In particular it does NOT call the store's `applyPersonToLowerThird`. That
 * helper is draft-only AND forces the template to `preacher-lower-third`, which
 * would quietly rewrite a selected rundown item's template and edit the hidden
 * draft instead of the visible item.
 *
 * It is authoring only: one `setFields` call, no publish, no Take, no Program.
 * Choosing a person changes the preview and nothing else.
 */
export default function PersonFastSwap() {
  const target = useEditTarget();
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listPeople()
      .then((list) => {
        if (alive) setPeople(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const appliedId = target.values.personId;
  const applied = people.find((person) => person.id === appliedId);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const ranked = [...people].sort((a, b) => {
      // Favourites first, then most recently used — a service uses the same few
      // people, and scrolling past the other forty is the cost this avoids.
      if (Boolean(b.favorite) !== Boolean(a.favorite)) return Number(b.favorite) - Number(a.favorite);
      return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
    });
    if (!needle) return ranked.slice(0, 6);
    return ranked
      .filter((person) =>
        [person.displayName, person.title, person.churchName, person.subtitle]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle))
      )
      .slice(0, 8);
  }, [people, query]);

  // Nothing to swap into: the control would imply an effect it cannot have.
  // Placed after the hooks so the hook order is identical on every render.
  if (!supportsPerson(target.templateId)) return null;

  const apply = (person: PersonProfile) => {
    // ONE write, through the target-aware path. Never a draft-only helper.
    target.setFields(personFieldPatch(person, target.templateId));
    // Recency feeds the ordering above; failure here must not cost the swap.
    markPersonUsed(person.id)
      .then((updated) => {
        if (updated) setPeople((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      })
      .catch(() => undefined);
    setOpen(false);
    setQuery('');
  };

  return (
    <section className="dock-card dock-person">
      <div className="dock-card__head">
        <span className="ll-kicker">Person</span>
        {applied ? <span className="dock-person__applied">{applied.displayName}</span> : null}
      </div>

      {people.length === 0 ? (
        <p className="dock-card__hint">
          No saved people yet. Add them in Library &rsaquo; People, then swap them in from here.
        </p>
      ) : !open ? (
        <button type="button" className="btn btn--secondary btn--sm dock-person__open" onClick={() => setOpen(true)}>
          <Icon name="user" size={14} />
          {applied ? 'Change person' : 'Use a saved person'}
        </button>
      ) : (
        <>
          {people.length > 6 ? (
            <input
              className="input input--sm dock-person__search"
              type="search"
              value={query}
              placeholder="Search people…"
              aria-label="Search saved people"
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <ul className="dock-person__list">
            {matches.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className={`dock-person__item${person.id === appliedId ? ' is-applied' : ''}`}
                  onClick={() => apply(person)}
                >
                  <span className="dock-person__name">{person.displayName}</span>
                  <span className="dock-person__meta">
                    {[person.title, person.churchName || person.subtitle].filter(Boolean).join(' · ') || '—'}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? <li className="dock-card__hint">No match.</li> : null}
          </ul>
          <button type="button" className="btn btn--ghost btn--xs dock-person__cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      )}
    </section>
  );
}
