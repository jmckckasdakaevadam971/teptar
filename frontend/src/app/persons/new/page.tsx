'use client';

import { useEffect, useState } from 'react';
import { PersonForm } from '@/components/PersonForm/PersonForm';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Person } from '@/lib/types';
import type { PersonRef } from '@/components/PersonPicker/PersonPicker';

/**
 * Создание персоны в трёх режимах (определяется query-параметрами):
 *  • без параметров        — новый корень древа;
 *  • ?father=<id>          — добавить сына/дочь к указанному человеку;
 *  • ?child=<id>           — создать отца и привязать к указанному ребёнку.
 */
export default function NewPersonPage() {
  const { user, ready } = useAuth();
  const [father, setFather] = useState<PersonRef | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [childName, setChildName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get('father');
    const c = params.get('child');
    (async () => {
      if (f) {
        try {
          const p = await api.persons.get(Number(f));
          setFather({ id: p.id, full_name: p.full_name });
        } catch {
          /* проигнорируем — покажем форму корня */
        }
      }
      if (c) {
        setChildId(Number(c));
        try {
          const p = await api.persons.get(Number(c));
          setChildName(p.full_name);
        } catch {
          /* проигнорируем */
        }
      }
      setLoaded(true);
    })();
  }, []);

  async function handleSaved(person: Person) {
    // Режим «указать отца»: привязываем созданного родителя к ребёнку.
    if (childId) {
      try {
        await api.persons.update(childId, { father_id: person.id });
      } catch {
        /* связь можно поправить вручную позже */
      }
      window.location.href = `/person/${childId}`;
      return;
    }
    // Режим «добавить потомка»: вернёмся к отцу, чтобы увидеть пополнение в древе.
    if (father) {
      window.location.href = `/person/${father.id}`;
      return;
    }
    window.location.href = `/person/${person.id}`;
  }

  if (ready && !user) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1>Нужен вход</h1>
        <p style={{ color: '#64748b' }}>Чтобы добавлять людей в древо, войдите в систему.</p>
        <a className="btn-primary" href="/login?next=/persons/new">
          Войти
        </a>
      </div>
    );
  }

  if (!ready || !loaded) return <p>Загрузка…</p>;

  const title = childId
    ? `Добавить отца для: ${childName || '…'}`
    : father
      ? `Добавить потомка к: ${father.full_name}`
      : 'Новый человек — корень древа';

  const hint = childId
    ? 'Создайте отца. После сохранения он будет привязан к ребёнку.'
    : father
      ? 'Новый человек получит указанного отца и появится в его древе.'
      : 'Создайте родоначальника. Затем добавляйте к нему детей и стройте древо.';

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>{title}</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>{hint}</p>
      <PersonForm
        mode="create"
        lockedFather={childId ? null : father}
        onSaved={handleSaved}
        submitLabel="Создать"
      />
    </div>
  );
}
