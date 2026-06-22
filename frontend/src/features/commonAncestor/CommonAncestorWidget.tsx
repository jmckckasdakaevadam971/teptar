'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { PersonPicker, type PersonRef } from '@/components/PersonPicker/PersonPicker';
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
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="rel-hint">Выберите двух людей — покажем, как они связаны.</p>

      <div className="rel-pickers">
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
        className="btn-primary"
        onClick={() => void handleSearch()}
        disabled={loading || !a || !b}
      >
        {loading ? 'Ищу…' : 'Узнать родство'}
      </button>

      {error && (
        <p className="vis-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {result && (
        <div className="rel-result">
          {result.ancestor ? (
            <>
              <p>
                Общий предок:{' '}
                <a className="rel-ancestor" href={`/person/${result.ancestor.id}`}>
                  {result.ancestor.full_name}
                </a>
              </p>
              <p className="rel-degree">Степень родства: {result.relation}</p>
            </>
          ) : (
            <p>{result.relation}</p>
          )}
        </div>
      )}
    </div>
  );
}
