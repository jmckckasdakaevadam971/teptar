'use client';

import type { Person } from '@/lib/types';

interface PersonCardProps {
  person: Person;
  onOpenTree?: (id: number) => void;
}

/** Карточка человека: ФИО, годы жизни, примечание. */
export function PersonCard({ person, onOpenTree }: PersonCardProps) {
  const years =
    person.birth_year || person.death_year
      ? `${person.birth_year ?? '?'} – ${person.death_year ?? (person.is_alive ? 'н.в.' : '?')}`
      : 'годы неизвестны';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{person.full_name}</h3>
        <span className={`badge ${person.gender === 'f' ? 'badge-f' : 'badge-m'}`}>
          {person.gender === 'f' ? 'жен.' : 'муж.'}
        </span>
      </div>
      <p style={{ color: '#64748b', margin: '6px 0' }}>{years}</p>
      {person.note && <p style={{ marginTop: 8 }}>{person.note}</p>}
      {onOpenTree && (
        <button className="btn-secondary" onClick={() => onOpenTree(person.id)} style={{ marginTop: 12 }}>
          Показать древо
        </button>
      )}
    </div>
  );
}
