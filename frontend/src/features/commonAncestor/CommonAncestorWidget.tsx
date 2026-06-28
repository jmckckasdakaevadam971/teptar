'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { PersonPicker, type PersonRef } from '@/components/PersonPicker/PersonPicker';
import { BTN_PRIMARY, CARD, ERR_TEXT } from '@/lib/ui';
import type { CommonAncestor } from '@/lib/types';

interface CommonAncestorWidgetProps {
  /** Заголовок виджета. */
  title?: string;
}

/**
 * «Кем мы родственники» — вирусная фича.
 * Два человека выбираются по имени (без ручного ввода ID),
 * показывается ближайший общий предок и степень родства.
 */
export function CommonAncestorWidget({ title = '🔗 Найти общего предка' }: CommonAncestorWidgetProps) {
  const [a, setA] = useState<PersonRef | null>(null);
  const [b, setB] = useState<PersonRef | null>(null);
  const [result, setResult] = useState<CommonAncestor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!a || !b) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(await api.tree.commonAncestor(a.id, b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={CARD}>
      <h3 className="mt-0 text-lg font-semibold text-cream">{title}</h3>
      <p className="mb-[18px] text-[15px] text-sand">Выберите двух людей — покажем, как они связаны.</p>

      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
        <PersonPicker
          label="Первый человек"
          value={a}
          onChange={setA}
          excludeId={b?.id}
          placeholder="Имя первого…"
        />
        <PersonPicker
          label="Второй человек"
          value={b}
          onChange={setB}
          excludeId={a?.id}
          placeholder="Имя второго…"
        />
      </div>

      <button
        className={`${BTN_PRIMARY} mt-4`}
        onClick={() => void handleSearch()}
        disabled={loading || !a || !b}
      >
        {loading ? 'Ищу…' : 'Узнать родство'}
      </button>

      {error && <p className={ERR_TEXT}>{error}</p>}

      {result && (
        <div className="mt-[22px] rounded-xl border border-gold-soft bg-gradient-to-b from-gold/10 to-stone-900/60 p-5 text-center">
          {result.ancestor ? (
            <>
              <p className="text-cream">
                Общий предок:{' '}
                <a
                  className="my-1.5 inline-block text-[22px] font-bold text-gold-light hover:underline"
                  href={`/person/${result.ancestor.id}`}
                >
                  {result.ancestor.full_name}
                </a>
              </p>
              <p className="mt-1 text-sm text-sand">Степень родства: {result.relation}</p>
            </>
          ) : (
            <p className="text-cream">{result.relation}</p>
          )}
        </div>
      )}
    </div>
  );
}
