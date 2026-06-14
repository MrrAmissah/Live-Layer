import { useCallback, useEffect, useMemo, useState } from 'react';
import { deletePerson, listPeople, markPersonUsed, savePerson } from '../lib/people/peopleStore';
import type { PersonProfile, PersonProfileInput } from '../types/people';

interface UsePeopleResult {
  people: PersonProfile[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  search: string;
  setSearch: (value: string) => void;
  filteredPeople: PersonProfile[];
  refresh: () => Promise<void>;
  save: (input: PersonProfileInput, id?: string) => Promise<PersonProfile>;
  remove: (id: string) => Promise<void>;
  markUsed: (id: string) => Promise<PersonProfile | null>;
}

function matchesSearch(person: PersonProfile, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    person.displayName,
    person.title,
    person.churchName,
    person.subtitle,
    person.notes
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(needle));
}

export function usePeople(): UsePeopleResult {
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const next = await listPeople();
      setPeople(next);
      setStatus('ready');
    } catch {
      setPeople([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredPeople = useMemo(
    () => people.filter((person) => matchesSearch(person, search)),
    [people, search]
  );

  const save = useCallback(async (input: PersonProfileInput, id?: string) => {
    const person = await savePerson(input, id);
    await refresh();
    return person;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deletePerson(id);
    await refresh();
  }, [refresh]);

  const markUsed = useCallback(async (id: string) => {
    const person = await markPersonUsed(id);
    await refresh();
    return person;
  }, [refresh]);

  return {
    people,
    status,
    search,
    setSearch,
    filteredPeople,
    refresh,
    save,
    remove,
    markUsed
  };
}
