'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PendingTree, Person } from '@/lib/types';

/** Описание диапазона лет древа. */
function yearsLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'годы не указаны';
  if (min != null && max != null) return `${min}–${max} гг.`;
  return `${min ?? max} г.`;
}

/** Годы жизни одной персоны. */
function personYears(p: Person): string {
  if (!p.birth_year && !p.death_year) return '—';
  return `${p.birth_year ?? '?'} – ${p.death_year ?? (p.is_alive ? 'н.в.' : '?')}`;
}

/** Корень древа для ссылки «открыть»: персона без отца (или самая ранняя). */
function rootOf(persons: Person[]): Person | null {
  if (persons.length === 0) return null;
  const roots = persons.filter((p) => !p.father_id);
  const pool = roots.length ? roots : persons;
  return pool.reduce((a, b) => ((a.birth_year ?? 9999) <= (b.birth_year ?? 9999) ? a : b));
}

/**
 * Очередь модерации общей базы: древа, отправленные пользователями.
 * Модератор может развернуть древо и посмотреть персоны перед решением.
 * Одобрение/отклонение применяется ко всему древу пользователя сразу.
 */
export function ModerationPanel() {
  const [trees, setTrees] = useState<PendingTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Предпросмотр: какое древо раскрыто и кэш загруженных персон.
  const [openId, setOpenId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Record<number, Person[]>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

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

  async function toggle(ownerId: number) {
    if (openId === ownerId) {
      setOpenId(null);
      return;
    }
    setOpenId(ownerId);
    if (!preview[ownerId]) {
      setPreviewLoading(true);
      try {
        const persons = await api.moderation.persons(ownerId);
        setPreview((prev) => ({ ...prev, [ownerId]: persons }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить древо');
        setOpenId(null);
      } finally {
        setPreviewLoading(false);
      }
    }
  }

  async function decide(ownerId: number, action: 'approve' | 'reject', name: string) {
    if (action === 'reject' && !confirm(`Отклонить древо пользователя «${name}»? Оно вернётся в личное.`)) {
      return;
    }
    setBusyId(ownerId);
    setError(null);
    try {
      await api.moderation[action](ownerId);
      setTrees((prev) => prev.filter((t) => t.owner_id !== ownerId));
      if (openId === ownerId) setOpenId(null);
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
        <div className="mod-list">
          {trees.map((t) => {
            const open = openId === t.owner_id;
            const persons = preview[t.owner_id];
            const root = persons ? rootOf(persons) : null;
            return (
              <div key={t.owner_id} className={`mod-item ${open ? 'open' : ''}`}>
                <div className="mod-row">
                  <button
                    type="button"
                    className="mod-toggle"
                    onClick={() => void toggle(t.owner_id)}
                    aria-expanded={open}
                  >
                    <span className={`mod-caret ${open ? 'down' : ''}`}>▸</span>
                    <span className="mod-name">{t.owner_name}</span>
                    <span className="mod-meta">
                      {t.count} {t.count === 1 ? 'персона' : 'персон'} · {yearsLabel(t.min_year, t.max_year)}
                    </span>
                  </button>
                  <div className="mod-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === t.owner_id}
                      onClick={() => void decide(t.owner_id, 'approve', t.owner_name)}
                    >
                      ✓ Одобрить
                    </button>
                    <button
                      type="button"
                      className="link-btn danger"
                      disabled={busyId === t.owner_id}
                      onClick={() => void decide(t.owner_id, 'reject', t.owner_name)}
                    >
                      ✖ Отклонить
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mod-preview">
                    {previewLoading && !persons ? (
                      <p style={{ color: '#64748b', margin: 0 }}>Загрузка древа…</p>
                    ) : persons && persons.length > 0 ? (
                      <>
                        <div className="mod-preview-head">
                          <span style={{ color: '#64748b', fontSize: 13 }}>
                            Персоны древа ({persons.length})
                          </span>
                          {root && (
                            <a
                              className="btn-secondary mod-open-tree"
                              href={`/person/${root.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть древо ↗
                            </a>
                          )}
                        </div>
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>ФИО</th>
                                <th>Пол</th>
                                <th>Годы</th>
                                <th>Примечание</th>
                              </tr>
                            </thead>
                            <tbody>
                              {persons.map((p) => (
                                <tr key={p.id}>
                                  <td>{p.full_name}</td>
                                  <td>{p.gender === 'f' ? 'жен.' : 'муж.'}</td>
                                  <td style={{ whiteSpace: 'nowrap' }}>{personYears(p)}</td>
                                  <td style={{ color: '#64748b', whiteSpace: 'normal' }}>{p.note ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: '#64748b', margin: 0 }}>В этом древе нет персон на модерации.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
