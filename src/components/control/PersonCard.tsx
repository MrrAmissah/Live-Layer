import { useAsset } from '../../hooks/useAsset';
import type { PersonProfile } from '../../types/people';

interface PersonCardProps {
  person: PersonProfile;
  onApply: (person: PersonProfile) => void;
  onEdit: (person: PersonProfile) => void;
  onDelete: (person: PersonProfile) => void;
}

function initialsFrom(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatLastUsed(value?: string) {
  if (!value) return 'Not used yet';
  try {
    return `Used ${new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short' }).format(new Date(value))}`;
  } catch {
    return 'Recently used';
  }
}

export default function PersonCard({ person, onApply, onEdit, onDelete }: PersonCardProps) {
  const headshot = useAsset(person.headshotAssetId);
  const detail = [person.title, person.churchName || person.subtitle].filter(Boolean).join(' · ');

  return (
    <li className="person-card">
      <div className="person-card__avatar">
        {headshot.src ? <img src={headshot.src} alt="" className="person-card__img" /> : <span>{initialsFrom(person.displayName)}</span>}
      </div>
      <div className="person-card__body">
        <div className="person-card__topline">
          <span className="person-card__name">{person.displayName}</span>
          {person.favorite ? <span className="ll-tag ll-tag--accent">Favorite</span> : null}
        </div>
        {detail ? <div className="person-card__meta">{detail}</div> : null}
        <div className="person-card__meta">{formatLastUsed(person.lastUsedAt)}</div>
        <div className="person-card__actions">
          <button type="button" className="btn btn--secondary btn--xs" onClick={() => onApply(person)}>
            Apply
          </button>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => onEdit(person)}>
            Edit
          </button>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => onDelete(person)}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
