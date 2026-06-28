'use client';

import { useEffect, useState } from 'react';
import { PersonForm } from '@/components/PersonForm/PersonForm';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Person } from '@/lib/types';
import type { PersonRef } from '@/components/PersonPicker/PersonPicker';
import { BTN_PRIMARY, CARD } from '@/lib/ui';

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
      <div className={`${CARD} mx-auto max-w-[460px]`}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Нужен вход</h1>
        <p className="text-sand">Чтобы добавлять людей в древо, войдите в систему.</p>
        <a className={`${BTN_PRIMARY} mt-3`} href="/login?next=/persons/new">
          Войти
        </a>
      </div>
    );
  }

  if (!ready || !loaded) return <p className="text-sand">Загрузка…</p>;

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
    <div className={`${CARD} mx-auto max-w-[680px]`}>
      <h1 className="mb-2 text-3xl font-bold text-cream">{title}</h1>
      <p className="mt-0 text-sand">{hint}</p>
      <PersonForm
        mode="create"
        lockedFather={childId ? null : father}
        onSaved={handleSaved}
        submitLabel="Создать"
      />
    </div>
  );
}
