import type { PersonProfile, PersonProfileInput } from '../../types/people';

const PEOPLE_STORAGE_KEY = 'livelayer.people';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `person-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readPeopleSync(): PersonProfile[] {
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizePerson).filter((person): person is PersonProfile => !!person)
      : [];
  } catch {
    return [];
  }
}

function writePeopleSync(people: PersonProfile[]) {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
}

function cleanInput(input: PersonProfileInput): PersonProfileInput {
  return {
    displayName: input.displayName.trim(),
    title: input.title?.trim() || undefined,
    churchName: input.churchName?.trim() || undefined,
    subtitle: input.subtitle?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    headshotAssetId: input.headshotAssetId?.trim() || undefined,
    logoAssetId: input.logoAssetId?.trim() || undefined,
    favorite: Boolean(input.favorite)
  };
}

function sortPeople(people: PersonProfile[]) {
  return [...people].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const aTime = a.lastUsedAt ?? a.updatedAt;
    const bTime = b.lastUsedAt ?? b.updatedAt;
    return bTime.localeCompare(aTime);
  });
}

function sanitizePerson(value: unknown): PersonProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const person = value as Partial<PersonProfile>;
  if (typeof person.id !== 'string') return null;
  if (typeof person.displayName !== 'string' || !person.displayName.trim()) return null;
  const now = new Date().toISOString();
  return {
    id: person.id,
    displayName: person.displayName.trim(),
    title: typeof person.title === 'string' && person.title.trim() ? person.title.trim() : undefined,
    churchName: typeof person.churchName === 'string' && person.churchName.trim() ? person.churchName.trim() : undefined,
    subtitle: typeof person.subtitle === 'string' && person.subtitle.trim() ? person.subtitle.trim() : undefined,
    notes: typeof person.notes === 'string' && person.notes.trim() ? person.notes.trim() : undefined,
    headshotAssetId: typeof person.headshotAssetId === 'string' && person.headshotAssetId.trim() ? person.headshotAssetId.trim() : undefined,
    logoAssetId: typeof person.logoAssetId === 'string' && person.logoAssetId.trim() ? person.logoAssetId.trim() : undefined,
    favorite: Boolean(person.favorite),
    lastUsedAt: typeof person.lastUsedAt === 'string' ? person.lastUsedAt : undefined,
    createdAt: typeof person.createdAt === 'string' ? person.createdAt : now,
    updatedAt: typeof person.updatedAt === 'string' ? person.updatedAt : now
  };
}

export async function listPeople(): Promise<PersonProfile[]> {
  return sortPeople(readPeopleSync());
}

export async function savePerson(input: PersonProfileInput, id?: string): Promise<PersonProfile> {
  const now = new Date().toISOString();
  const people = readPeopleSync();
  const clean = cleanInput(input);
  if (!clean.displayName) {
    throw new Error('person-name-required');
  }

  const existing = id ? people.find((person) => person.id === id) : undefined;
  const next: PersonProfile = {
    id: existing?.id ?? createId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: existing?.lastUsedAt,
    ...clean
  };

  const merged = existing
    ? people.map((person) => (person.id === existing.id ? next : person))
    : [next, ...people];
  writePeopleSync(sortPeople(merged));
  return next;
}

/** Append already-remapped people during pack import. Existing records are never overwritten. */
export async function importPeople(profiles: PersonProfile[]): Promise<PersonProfile[]> {
  if (!profiles.length) return [];
  const people = readPeopleSync();
  const existingIds = new Set(people.map((person) => person.id));
  const fresh = profiles.map(sanitizePerson).filter((person): person is PersonProfile => !!person && !existingIds.has(person.id));
  if (!fresh.length) return [];
  writePeopleSync(sortPeople([...fresh, ...people]));
  return fresh;
}

export async function deletePerson(id: string): Promise<void> {
  writePeopleSync(readPeopleSync().filter((person) => person.id !== id));
}

export async function clearPeople(): Promise<void> {
  localStorage.removeItem(PEOPLE_STORAGE_KEY);
}

export async function markPersonUsed(id: string): Promise<PersonProfile | null> {
  const people = readPeopleSync();
  const person = people.find((item) => item.id === id);
  if (!person) return null;
  const next = { ...person, lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  writePeopleSync(sortPeople(people.map((item) => (item.id === id ? next : item))));
  return next;
}
