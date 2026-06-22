'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PendingTree } from '@/lib/types';

/** Описание диапазона лет древа. */
function yearsLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'годы не указаны';
  if (min != null && max != null) return `${min}–${max} гг.`;
  return `${min ?? max} г.`;
}

/**
 * Очередь модерации общей базы: древа, отправленные пользователями.
 * Одобрение/отклонение применяется ко всему древу пользователя сразу.
 */
export function ModerationPanel() {
  const [trees, setTrees] = useState<PendingTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrees(await api.moderation.pending());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(ownerId: number, action: 'approve' | 'reject') {
    setBusyId(ownerId);
    setError(null);
    try {
      await api.moderation[action](ownerId);
      setTrees((prev) => prev.filter((t) => t.owner_id !== ownerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Модерация общей базы</h2>
        <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      {loading ? (
        <p style={{ color: '#64748b' }}>Загрузка…</p>
      ) : trees.length === 0 ? (
        <p style={{ color: '#64748b' }}>Нет древ, ожидающих модерации.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Персон</th>
                <th>Годы</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trees.map((t) => (
                <tr key={t.owner_id}>
                  <td>{t.owner_name}</td>
                  <td>{t.count}</td>
                  <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                    {yearsLabel(t.min_year, t.max_year)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busyId === t.owner_id}
                        onClick={() => void decide(t.owner_id, 'approve')}
                      >
                        ✓ Одобрить
                      </button>
                      <button
                        type="button"
                        className="link-btn danger"
                        disabled={busyId === t.owner_id}
                        onClick={() => void decide(t.owner_id, 'reject')}
                      >
                        ✖ Отклонить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
