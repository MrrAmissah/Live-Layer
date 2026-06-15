import { useState } from 'react';
import { usePeople } from '../../hooks/usePeople';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import type { PersonProfile, PersonProfileInput } from '../../types/people';
import PersonCard from './PersonCard';
import PersonForm from './PersonForm';

export default function PeopleLibrary() {
  const {
    status,
    search,
    setSearch,
    filteredPeople,
    save,
    remove,
    markUsed
  } = usePeople();
  const applyPersonToLowerThird = useLiveLayerStore((state) => state.applyPersonToLowerThird);
  const [editing, setEditing] = useState<PersonProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSave = async (input: PersonProfileInput, id?: string) => {
    await save(input, id);
    setEditing(null);
    setShowForm(false);
    setNotice(id ? 'Person updated.' : 'Person saved.');
  };

  const handleApply = async (person: PersonProfile) => {
    applyPersonToLowerThird(person);
    await markUsed(person.id);
    setNotice(`${person.displayName} applied to the lower third.`);
  };

  const handleDelete = async (person: PersonProfile) => {
    const confirmed = window.confirm(`Delete ${person.displayName}? This will not remove saved presets or uploaded image assets.`);
    if (!confirmed) return;
    await remove(person.id);
    if (editing?.id === person.id) {
      setEditing(null);
      setShowForm(false);
    }
    setNotice('Person deleted.');
  };

  const startAdd = () => {
    setEditing(null);
    setShowForm(true);
    setNotice(null);
  };

  const startEdit = (person: PersonProfile) => {
    setEditing(person);
    setShowForm(true);
    setNotice(null);
  };

  return (
    <div className="people-lib">
      <div className="people-lib__toolbar">
        <input
          className="field__input"
          value={search}
          placeholder="Search people..."
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={startAdd}>
          Add person
        </button>
      </div>

      {showForm ? (
        <PersonForm
          person={editing}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setShowForm(false);
          }}
        />
      ) : null}

      {notice ? <div className="field__hint" role="status" aria-live="polite">{notice}</div> : null}

      {status === 'loading' ? <div className="field__hint" role="status" aria-live="polite">Loading people...</div> : null}
      {status === 'error' ? <div className="field__hint field__hint--error" role="alert">Unable to load people.</div> : null}

      {filteredPeople.length === 0 && status !== 'loading' ? (
        <div className="empty-state">
          <p className="empty-state__title">{search.trim() ? 'No matching people' : 'No saved people'}</p>
          <p className="empty-state__hint">Save a speaker once, then apply them to a lower third in one step.</p>
        </div>
      ) : (
        <ul className="person-list">
          {filteredPeople.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              onApply={handleApply}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
