'use client';

import { useEffect, useState } from 'react';
import { PersonForm } from '@/components/PersonForm/PersonForm';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Person } from '@/lib/types';

/** Редактирование существующей персоны. */
export default function EditPersonPage({ params }: { params: { id: string } }) {
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
      <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1>Нужен вход</h1>
        <p style={{ color: '#64748b' }}>Чтобы редактировать запись, войдите в систему.</p>
        <a className="btn-primary" href={`/login?next=/person/${personId}/edit`}>
          Войти
        </a>
      </div>
    );
  }

  if (error) return <p style={{ color: '#dc2626' }}>{error}</p>;
  if (!person) return <p>Загрузка…</p>;

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>Редактировать: {person.full_name}</h1>
      <PersonForm
        mode="edit"
        initial={person}
        onSaved={(p) => (window.location.href = `/person/${p.id}`)}
        submitLabel="Сохранить"
      />
    </div>
  );
}
