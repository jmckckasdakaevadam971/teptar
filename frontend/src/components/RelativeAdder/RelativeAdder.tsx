'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { ACCENT_CARD, BTN_PRIMARY, BTN_SECONDARY, ERR_TEXT, INPUT } from '@/lib/ui';
import type { Person } from '@/lib/types';

/** Тип добавляемого родственника. */
type Kind = 'son' | 'daughter' | 'father' | 'mother' | 'spouse';

interface KindMeta {
  kind: Kind;
  label: string;
  icon: string;
}

interface RelativeAdderProps {
  person: Person;
  /** Вызывается после успешного добавления (id новой персоны). */
  onAdded: (newId: number) => void;
}

/**
 * Панель быстрого добавления родственника прямо со страницы человека.
 * Кнопка типа связи → короткая форма (имя + годы) → создание персоны
 * с правильной привязкой (отец/мать по полу, либо брак) → обновление древа.
 */
export function RelativeAdder({ person, onAdded }: RelativeAdderProps) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [death, setDeath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Доступные типы связей зависят от пола и уже заполненных родителей.
  const spouseMeta: KindMeta =
    person.gender === 'm'
      ? { kind: 'spouse', label: 'Жена', icon: '💍' }
      : { kind: 'spouse', label: 'Муж', icon: '💍' };

  const options: KindMeta[] = [
    { kind: 'son', label: 'Сын', icon: '👦' },
    { kind: 'daughter', label: 'Дочь', icon: '👧' },
    ...(!person.father_id ? [{ kind: 'father' as Kind, label: 'Отец', icon: '👨' }] : []),
    ...(!person.mother_id ? [{ kind: 'mother' as Kind, label: 'Мать', icon: '👩' }] : []),
    spouseMeta,
  ];

  function reset() {
    setKind(null);
    setName('');
    setBirth('');
    setDeath('');
    setError(null);
  }

  function pickKind(k: Kind) {
    setKind(k);
    setName('');
    setBirth('');
    setDeath('');
    setError(null);
  }

  async function submit() {
    if (!kind) return;
    const fullName = name.trim();
    if (fullName.length < 2) {
      setError('Укажите имя (минимум 2 символа).');
      return;
    }
    const by = birth ? Number(birth) : null;
    const dy = death ? Number(death) : null;
    if (by !== null && dy !== null && dy < by) {
      setError('Год смерти не может быть раньше года рождения.');
      return;
    }

    // Пол новой персоны по типу связи.
    const gender: Person['gender'] =
      kind === 'son' || kind === 'father'
        ? 'm'
        : kind === 'daughter' || kind === 'mother'
          ? 'f'
          : person.gender === 'm'
            ? 'f' // жена
            : 'm'; // муж

    const base = { full_name: fullName, gender, birth_year: by, death_year: dy };

    setBusy(true);
    setError(null);
    try {
      if (kind === 'son' || kind === 'daughter') {
        // Ребёнок: привязываем к текущему как отцу или матери (по полу текущего).
        const link =
          person.gender === 'm' ? { father_id: person.id } : { mother_id: person.id };
        const child = await api.persons.create({ ...base, ...link });
        onAdded(child.id);
      } else if (kind === 'father') {
        const f = await api.persons.create(base);
        await api.persons.update(person.id, { father_id: f.id });
        onAdded(f.id);
      } else if (kind === 'mother') {
        const m = await api.persons.create(base);
        await api.persons.update(person.id, { mother_id: m.id });
        onAdded(m.id);
      } else {
        // Супруг(а): создаём и связываем браком.
        const sp = await api.persons.create(base);
        if (person.gender === 'm') {
          await api.relations.addMarriage(person.id, sp.id);
        } else {
          await api.relations.addMarriage(sp.id, person.id);
        }
        onAdded(sp.id);
      }
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить родственника');
    } finally {
      setBusy(false);
    }
  }

  const activeLabel = options.find((o) => o.kind === kind)?.label ?? '';

  return (
    <div className={ACCENT_CARD}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
        <h3 className="m-0 text-lg font-semibold text-cream">Добавить родственника</h3>
        <span className="text-sm text-sand">к: {person.full_name}</span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button
            key={o.kind}
            type="button"
            className={`flex min-w-[78px] cursor-pointer flex-col items-center gap-1 rounded-xl border bg-stone-700 px-3.5 py-3 text-sm transition hover:-translate-y-0.5 hover:border-gold-soft ${
              kind === o.kind ? 'border-gold bg-gold/15 text-gold-light' : 'border-line text-cream'
            }`}
            onClick={() => pickKind(o.kind)}
          >
            <span className="text-2xl leading-none">{o.icon}</span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>

      {kind && (
        <div className="mt-3.5 grid gap-3">
          <div className="flex flex-wrap gap-2.5">
            <input
              className={`${INPUT} min-w-[160px] flex-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Имя (${activeLabel.toLowerCase()})`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
            <input
              className={`${INPUT} !w-[90px] !flex-none`}
              type="number"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              placeholder="г.р."
            />
            <input
              className={`${INPUT} !w-[90px] !flex-none`}
              type="number"
              value={death}
              onChange={(e) => setDeath(e.target.value)}
              placeholder="г.с."
            />
          </div>

          {error && <p className={ERR_TEXT}>{error}</p>}

          <div className="flex gap-2.5">
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => void submit()}
              disabled={busy || name.trim().length < 2}
            >
              {busy ? 'Добавляю…' : `Добавить: ${activeLabel}`}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={reset} disabled={busy}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
