'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, LINK_DANGER, TABLE, TABLE_WRAP } from '@/lib/ui';
import type { PendingTree, Person, DuplicatePair, TreeChange } from '@/lib/types';

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

/** Человеко-читаемые названия полей для diff. */
const FIELD_RU: Record<string, string> = {
  full_name: 'ФИО',
  gender: 'Пол',
  birth_year: 'Год рождения',
  death_year: 'Год смерти',
  teip_id: 'Тейп',
  gar_id: 'Гар',
  village_id: 'Село',
  note: 'Примечание',
  father_id: 'Отец',
  mother_id: 'Мать',
};

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
  // Возможные дубли с другими древами (по владельцу).
  const [duplicates, setDuplicates] = useState<Record<number, DuplicatePair[]>>({});
  // Правки, появившиеся после повторной отправки (что изменилось).
  const [changes, setChanges] = useState<Record<number, TreeChange[]>>({});

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
        const [persons, dups] = await Promise.all([
          api.moderation.persons(ownerId),
          api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
        ]);
        setPreview((prev) => ({ ...prev, [ownerId]: persons }));
        setDuplicates((prev) => ({ ...prev, [ownerId]: dups }));
        api.moderation
          .changes(ownerId)
          .then((ch) => setChanges((prev) => ({ ...prev, [ownerId]: ch })))
          .catch(() => undefined);
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

  /** Объединить две записи: keep остаётся, drop удаляется и перепривязывается. */
  async function merge(ownerId: number, keepId: number, dropId: number) {
    if (!confirm('Объединить эти две записи? Действие необратимо.')) return;
    setBusyId(ownerId);
    setError(null);
    try {
      await api.moderation.merge(keepId, dropId);
      const [persons, dups] = await Promise.all([
        api.moderation.persons(ownerId),
        api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
      ]);
      setPreview((prev) => ({ ...prev, [ownerId]: persons }));
      setDuplicates((prev) => ({ ...prev, [ownerId]: dups }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось объединить');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-xl font-semibold text-cream">Модерация общей базы</h2>
        <button type="button" className={BTN_SECONDARY} onClick={() => void load()} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}

      {loading ? (
        <p className="text-sand">Загрузка…</p>
      ) : trees.length === 0 ? (
        <p className="text-sand">Нет древ, ожидающих модерации.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {trees.map((t) => {
            const open = openId === t.owner_id;
            const persons = preview[t.owner_id];
            const root = persons ? rootOf(persons) : null;
            return (
              <div
                key={t.owner_id}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  open ? 'border-gold-soft' : 'border-line'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-[200px] flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-cream"
                    onClick={() => void toggle(t.owner_id)}
                    aria-expanded={open}
                  >
                    <span className={`inline-block text-[13px] text-gold transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                    <span className="text-[15px] font-bold text-gold-light">{t.owner_name}</span>
                    <span className="text-[13px] text-sand">
                      {t.count} {t.count === 1 ? 'персона' : 'персон'} · {yearsLabel(t.min_year, t.max_year)}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      disabled={busyId === t.owner_id}
                      onClick={() => void decide(t.owner_id, 'approve', t.owner_name)}
                    >
                      ✓ Одобрить
                    </button>
                    <button
                      type="button"
                      className={LINK_DANGER}
                      disabled={busyId === t.owner_id}
                      onClick={() => void decide(t.owner_id, 'reject', t.owner_name)}
                    >
                      ✖ Отклонить
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-dashed border-line bg-gold/[0.04] px-3.5 pb-3.5 pt-3">
                    {previewLoading && !persons ? (
                      <p className="m-0 text-sand">Загрузка древа…</p>
                    ) : persons && persons.length > 0 ? (
                      <>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
                          <span className="text-[13px] text-sand">
                            Персоны древа ({persons.length})
                          </span>
                          {root && (
                            <a
                              className={`${BTN_SECONDARY} !px-3 !py-[5px] !text-[13px]`}
                              href={`/person/${root.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть древо ↗
                            </a>
                          )}
                        </div>
                        <div className={TABLE_WRAP}>
                          <table className={TABLE}>
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
                                  <td className="whitespace-nowrap">{personYears(p)}</td>
                                  <td className="whitespace-normal text-sand">{p.note ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="m-0 text-sand">В этом древе нет персон на модерации.</p>
                    )}

                    {changes[t.owner_id] && changes[t.owner_id].length > 0 && (
                      <div className="mt-3 rounded-lg border border-line bg-gold/[0.04] p-3">
                        <p className="m-0 mb-2 text-[13px] font-bold text-gold-light">
                          ✎ Что изменилось ({changes[t.owner_id].length})
                        </p>
                        <div className="flex flex-col gap-2">
                          {changes[t.owner_id].map((c, i) => (
                            <div key={`${c.person_id}-${i}`} className="text-[13px]">
                              <span className="text-gold-light">{c.full_name}</span>
                              <ul className="m-0 mt-1 list-disc pl-5 text-sand">
                                {Object.entries(c.diff).map(([field, v]) => (
                                  <li key={field}>
                                    {FIELD_RU[field] ?? field}: <s>{String(v.from ?? '—')}</s> →{' '}
                                    <span className="text-cream">{String(v.to ?? '—')}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {duplicates[t.owner_id] && duplicates[t.owner_id].length > 0 && (
                      <div className="mt-3 rounded-lg border border-gold-soft bg-gold/[0.06] p-3">
                        <p className="m-0 mb-2 text-[13px] font-bold text-gold-light">
                          ⚠ Возможные совпадения с другими древами ({duplicates[t.owner_id].length})
                        </p>
                        <div className="flex flex-col gap-2">
                          {duplicates[t.owner_id].map((d, i) => (
                            <div
                              key={`${d.person.id}-${d.candidate.id}-${i}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-2.5 py-2"
                            >
                              <div className="min-w-[220px] flex-1 text-[13px] text-cream">
                                <span className="text-gold-light">{d.person.full_name}</span>
                                <span className="text-sand"> ({d.person.birth_year ?? '?'})</span>
                                <span className="text-sand"> ↔ </span>
                                <span className="text-gold-light">{d.candidate.full_name}</span>
                                <span className="text-sand"> ({d.candidate.birth_year ?? '?'})</span>
                                <span className="text-sand">
                                  {' · '}
                                  {d.candidate.owner_name ?? 'другой автор'} · ~{Math.round(d.candidate.similarity * 100)}%
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className={`${BTN_SECONDARY} !px-2.5 !py-1 !text-[12px]`}
                                  disabled={busyId === t.owner_id}
                                  onClick={() => void merge(t.owner_id, d.candidate.id, d.person.id)}
                                >
                                  Оставить чужую
                                </button>
                                <button
                                  type="button"
                                  className={`${BTN_PRIMARY} !px-2.5 !py-1 !text-[12px]`}
                                  disabled={busyId === t.owner_id}
                                  onClick={() => void merge(t.owner_id, d.person.id, d.candidate.id)}
                                >
                                  Оставить эту
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
