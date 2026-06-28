'use client';

import type { Person } from '@/lib/types';
import { BADGE_F, BADGE_M, BTN_SECONDARY, CARD, VIS_PENDING, VIS_PUBLIC } from '@/lib/ui';

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
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-cream">{person.full_name}</h3>
        <div className="flex items-center gap-2">
          {person.visibility === 'public' && person.status === 'pending' && (
            <span className={VIS_PENDING}>⏳ На модерации</span>
          )}
          {person.visibility === 'public' && person.status === 'approved' && (
            <span className={VIS_PUBLIC}>🌍 В базе</span>
          )}
          <span className={person.gender === 'f' ? BADGE_F : BADGE_M}>
            {person.gender === 'f' ? 'жен.' : 'муж.'}
          </span>
        </div>
      </div>
      <p className="my-1.5 text-sand">{years}</p>
      {person.note && <p className="mt-2 text-cream/90">{person.note}</p>}
      {onOpenTree && (
        <button className={`${BTN_SECONDARY} mt-3`} onClick={() => onOpenTree(person.id)}>
          Показать древо
        </button>
      )}
    </div>
  );
}
