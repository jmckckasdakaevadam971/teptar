'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CommonAncestor } from '@/lib/types';

/**
 * Виджет «Общий предок» — вирусная фича.
 * Пользователь вводит ID двух людей и получает их ближайшего общего предка
 * и степень родства.
 */
export function CommonAncestorWidget() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState<CommonAncestor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await api.tree.commonAncestor(Number(a), Number(b));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🔗 Найти общего предка</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="ID первого"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        <input
          className="input"
          placeholder="ID второго"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading || !a || !b}>
          {loading ? '…' : 'Найти'}
        </button>
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 8 }}>
          {result.ancestor ? (
            <>
              <p>
                Общий предок: <strong>{result.ancestor.full_name}</strong>
              </p>
              <p style={{ color: '#2563eb' }}>Степень родства: {result.relation}</p>
            </>
          ) : (
            <p>{result.relation}</p>
          )}
        </div>
      )}
    </div>
  );
}
