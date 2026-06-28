'use client';

import { useEffect, useState } from 'react';
import { PersonForm } from '@/components/PersonForm/PersonForm';
import { AppFrame } from '@/components/AppFrame/AppFrame';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Person } from '@/lib/types';
import { BTN_PRIMARY, CARD } from '@/lib/ui';

/** Редактирование существующей персоны. */
export default function EditPersonPage(props: { params: { id: string } }) {
  return (
    <AppFrame>
      <EditPersonPageInner {...props} />
    </AppFrame>
  );
}

function EditPersonPageInner({ params }: { params: { id: string } }) {
  const personId = Number(params.id);
  const { user, ready } = useAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.persons
      .get(personId)
      .then(setPerson)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'));
  }, [personId]);

  if (ready && !user) {
    return (
      <div className={`${CARD} mx-auto max-w-[460px]`}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Нужен вход</h1>
        <p className="text-sand">Чтобы редактировать запись, войдите в систему.</p>
        <a className={`${BTN_PRIMARY} mt-3`} href={`/login?next=/person/${personId}/edit`}>
          Войти
        </a>
      </div>
    );
  }

  if (error) return <p className="text-[#dc2626]">{error}</p>;
  if (!person) return <p className="text-sand">Загрузка…</p>;

  return (
    <div className={`${CARD} mx-auto max-w-[680px]`}>
      <h1 className="mb-3 text-3xl font-bold text-cream">Редактировать: {person.full_name}</h1>
      <PersonForm
        mode="edit"
        initial={person}
        onSaved={(p) => (window.location.href = `/person/${p.id}`)}
        submitLabel="Сохранить"
      />
    </div>
  );
}
