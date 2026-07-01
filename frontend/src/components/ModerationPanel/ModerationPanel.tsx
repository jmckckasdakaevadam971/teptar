'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { TreeView } from '@/components/TreeView/TreeView';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, LINK_DANGER, TABLE, TABLE_WRAP } from '@/lib/ui';
import type { PendingTree, Person, DuplicatePair, TreeChange } from '@/lib/types';
import type { Person as TreePerson } from '@/lib/demo-data';

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

/** Преобразовать персоны из бэкенда в формат визуального древа TreeView. */
function toTreePeople(persons: Person[]): TreePerson[] {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const genCache = new Map<number, number>();
  const genOf = (p: Person, seen = new Set<number>()): number => {
    const cached = genCache.get(p.id);
    if (cached != null) return cached;
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const father = p.father_id != null ? byId.get(p.father_id) : undefined;
    const g = father ? genOf(father, seen) + 1 : 0;
    genCache.set(p.id, g);
    return g;
  };
  return persons.map((p) => ({
    id: String(p.id),
    name: p.full_name,
    birth: p.birth_year != null ? String(p.birth_year) : undefined,
    death: p.death_year != null ? String(p.death_year) : undefined,
    role: p.gender === 'f' ? 'дочь' : 'сын',
    teip: '',
    bio: p.note ?? undefined,
    generation: genOf(p),
    parentId: p.father_id != null && byId.has(p.father_id) ? String(p.father_id) : undefined,
  }));
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

  // Просмотр: какое древо открыто в модальном окне и кэш загруженных персон.
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [viewerSelected, setViewerSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState<Record<number, Person[]>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  // Возможные дубли с другими древами (по владельцу).
  const [duplicates, setDuplicates] = useState<Record<number, DuplicatePair[]>>({});

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

  useEffect(() => setMounted(true), []);

  async function openViewer(ownerId: number) {
    setViewerId(ownerId);
    setViewerSelected(null);
    if (!preview[ownerId]) {
      setPreviewLoading(true);
      try {
        const [persons, dups] = await Promise.all([
          api.moderation.persons(ownerId),
          api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
        ]);
        setPreview((prev) => ({ ...prev, [ownerId]: persons }));
        setDuplicates((prev) => ({ ...prev, [ownerId]: dups }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить древо');
        setViewerId(null);
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
      if (viewerId === ownerId) setViewerId(null);
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
          {trees.map((t) => (
            <div
              key={t.owner_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5"
            >
              <div className="flex min-w-[200px] flex-1 items-center gap-2.5 text-cream">
                <span className="text-[15px] font-bold text-gold-light">{t.owner_name}</span>
                <span className="text-[13px] text-sand">
                  {t.count} {t.count === 1 ? 'персона' : 'персон'} · {yearsLabel(t.min_year, t.max_year)}
                </span>
              </div>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busyId === t.owner_id}
                onClick={() => void openViewer(t.owner_id)}
              >
                Просмотреть древо
              </button>
            </div>
          ))}
        </div>
      )}

      {mounted && viewerId != null && createPortal(
        (() => {
          const t = trees.find((x) => x.owner_id === viewerId);
          if (!t) return null;
          const persons = preview[viewerId];
          const dups = duplicates[viewerId] ?? [];
          return (
            <div className="fixed inset-0 z-[70] flex flex-col bg-background">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex min-w-[200px] items-center gap-2.5">
                  <button type="button" className={BTN_SECONDARY} onClick={() => setViewerId(null)}>
                    ← Назад
                  </button>
                  <span className="text-[16px] font-bold text-gold-light">{t.owner_name}</span>
                  <span className="text-[13px] text-sand">
                    {t.count} {t.count === 1 ? 'персона' : 'персон'} · {yearsLabel(t.min_year, t.max_year)}
                  </span>
                </div>
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

              <div className="flex-1 overflow-auto p-4">
                {previewLoading && !persons ? (
                  <p className="text-sand">Загрузка древа…</p>
                ) : persons && persons.length > 0 ? (
                  <>
                    <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                      <TreeView
                        people={toTreePeople(persons)}
                        selectedId={viewerSelected}
                        onSelect={setViewerSelected}
                      />
                    </div>

                    <div className="mt-4">
                      <span className="text-[13px] text-sand">Персоны древа ({persons.length})</span>
                      <div className={`${TABLE_WRAP} mt-2`}>
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
                    </div>

                    {dups.length > 0 && (
                      <div className="mt-4 rounded-lg border border-gold-soft bg-gold/[0.06] p-3">
                        <p className="m-0 mb-2 text-[13px] font-bold text-gold-light">
                          ⚠ Возможные совпадения с другими древами ({dups.length})
                        </p>
                        <div className="flex flex-col gap-2">
                          {dups.map((d, i) => (
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
                  </>
                ) : (
                  <p className="text-sand">В этом древе нет персон на модерации.</p>
                )}
              </div>
            </div>
          );
        })(),
        document.body,
      )}

      <EditQueue />
    </div>
  );
}

/** Очередь правок опубликованных записей: старые данные публичны, новые ждут одобрения. */
function EditQueue() {
  const [owners, setOwners] = useState<PendingTree[]>([]);
  const [changes, setChanges] = useState<Record<number, TreeChange[]>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const os = await api.moderation.editOwners();
      setOwners(os);
      const map: Record<number, TreeChange[]> = {};
      await Promise.all(
        os.map((o) => api.moderation.changes(o.owner_id).then((c) => { map[o.owner_id] = c; }).catch(() => undefined)),
      );
      setChanges(map);
    } catch {
      setOwners([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(personId: number, action: 'approveEdit' | 'rejectEdit') {
    setBusy(personId);
    try {
      await api.moderation[action](personId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (owners.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="m-0 mb-3 text-lg font-semibold text-cream">Правки опубликованных записей</h3>
      <div className="flex flex-col gap-3">
        {owners.map((o) =>
          (changes[o.owner_id] ?? []).map((c) => (
            <div key={c.person_id} className="rounded-xl border border-line p-3">
              <p className="m-0 text-[14px] font-bold text-gold-light">{c.full_name}</p>
              <span className="text-[12px] text-sand">{o.owner_name}</span>
              <ul className="m-0 mt-1.5 list-disc pl-5 text-[13px] text-sand">
                {Object.entries(c.diff).map(([field, v]) => (
                  <li key={field}>
                    {FIELD_RU[field] ?? field}: <s>{String(v.from ?? '—')}</s> →{' '}
                    <span className="text-cream">{String(v.to ?? '—')}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button type="button" className={`${BTN_PRIMARY} !px-3 !py-1 !text-[13px]`} disabled={busy === c.person_id} onClick={() => void act(c.person_id, 'approveEdit')}>
                  ✓ Применить
                </button>
                <button type="button" className={`${LINK_DANGER}`} disabled={busy === c.person_id} onClick={() => void act(c.person_id, 'rejectEdit')}>
                  ✖ Отклонить
                </button>
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
