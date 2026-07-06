'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ModerationPanel } from '@/components/ModerationPanel/ModerationPanel';
import { KeeperApplicationsCard } from '@/components/KeepersView/AdminKeepers';
import { PageHeader } from '@/components/PageHeader/PageHeader';
import { AppFrame } from '@/components/AppFrame/AppFrame';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, LINK_DANGER, ROLE_SELECT, TABLE, TABLE_WRAP } from '@/lib/ui';
import type { AdminStats, AdminTree, AdminUser, Teip, UserRole } from '@/lib/types';

/** Человекочитаемые названия ролей. */
const ROLE_LABELS: Record<UserRole, string> = {
  viewer: 'Читатель',
  editor: 'Редактор',
  teip_admin: 'Админ тейпа',
  super_admin: 'Супер-админ',
};

const ROLE_OPTIONS: UserRole[] = ['viewer', 'editor', 'teip_admin', 'super_admin'];

const STAT_LABELS: { key: keyof AdminStats; label: string }[] = [
  { key: 'users', label: 'Пользователи' },
  { key: 'persons', label: 'Персоны' },
  { key: 'teips', label: 'Тейпы' },
  { key: 'villages', label: 'Сёла' },
];

export default function AdminPage() {
  return (
    <AppFrame>
      <AdminPageInner />
    </AppFrame>
  );
}

function AdminPageInner() {
  const { user, ready } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  /** Пользователь, которому назначаем «Админ тейпа», но тейп не указан — нужен выбор. */
  const [teipPick, setTeipPick] = useState<{ id: number; name: string } | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';
  const canModerate = isSuperAdmin || user?.role === 'teip_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u] = await Promise.all([
        api.admin.stats(),
        api.admin.users(),
      ]);
      setStats(s);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && isSuperAdmin) void load();
    else if (ready) setLoading(false);
  }, [ready, isSuperAdmin, load]);

  async function changeRole(id: number, role: UserRole, teipId?: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.admin.setRole(id, role, teipId);
      // Перечитываем список: бэк автоматически закрепляет/снимает тейп хранителя.
      setUsers(await api.admin.users());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сменить роль');
    } finally {
      setBusyId(null);
    }
  }

  /** Смена роли из селекта: для «Админ тейпа» без тейпа — сначала выбор тейпа. */
  function onRoleSelect(u: AdminUser, role: UserRole) {
    if (role === 'teip_admin' && !u.teip_name) {
      setTeipPick({ id: u.id, name: u.display_name });
      return;
    }
    void changeRole(u.id, role);
  }

  async function removeUser(id: number, name: string) {
    if (!confirm(`Удалить пользователя «${name}»? Это действие необратимо.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await api.admin.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setStats((prev) => (prev ? { ...prev, users: prev.users - 1 } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <div className={CARD}>Загрузка…</div>;

  if (!canModerate) {
    return (
      <div className={`${CARD} mx-auto max-w-md text-center`}>
        <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">Админ-панель</h1>
        <p className="text-muted-foreground">
          Доступ только для администраторов. Войдите под учётной записью с
          правами модерации.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Админ-панель"
        description={
          isSuperAdmin
            ? 'Управление пользователями, модерация и обзор данных проекта.'
            : 'Модерация древ, отправленных пользователями в общую базу.'
        }
      />

      <ModerationPanel />

      {isSuperAdmin && (
        <>
          {error && (
            <div className="rounded border border-danger-border bg-danger-bg p-[18px] text-danger">
              {error}
            </div>
          )}

          {/* Обзор */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-2xl border border-border bg-card p-5 text-center">
                <div className="font-serif text-[32px] font-extrabold leading-[1.1] text-accent">
                  {stats ? stats[key] : '—'}
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Заявки в хранители */}
          <KeeperApplicationsCard onApproved={() => void load()} />

          {/* Опубликованные древа */}
          <PublishedTreesCard onChanged={() => void load()} />

          {/* Пользователи */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 font-serif text-xl font-semibold text-foreground">Пользователи</h2>
              <button type="button" className={BTN_SECONDARY} onClick={() => void load()} disabled={loading}>
                Обновить
              </button>
            </div>

            {loading ? (
              <p className="text-muted-foreground">Загрузка…</p>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground">Пользователей пока нет.</p>
            ) : (
              <div className={TABLE_WRAP}>
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Телефон</th>
                      <th>E-mail</th>
                      <th>Тейп · Село</th>
                      <th>Роль</th>
                      <th>Модерирует</th>
                      <th>Регистрация</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.id === user?.id;
                      return (
                        <tr key={u.id}>
                          <td className="whitespace-nowrap">
                            <span className="font-semibold text-accent">{u.display_name}</span>
                            {isSelf && <span className="text-xs text-muted-foreground"> (вы)</span>}
                          </td>
                          <td className="whitespace-nowrap">{u.phone ?? '—'}</td>
                          <td className="whitespace-nowrap">{u.email ?? '—'}</td>
                          <td className="whitespace-nowrap">
                            {u.teip_name || u.village_name
                              ? [u.teip_name, u.village_name].filter(Boolean).join(' · ')
                              : '—'}
                          </td>
                          <td>
                            <select
                              className={ROLE_SELECT}
                              value={u.role}
                              disabled={isSelf || busyId === u.id}
                              onChange={(e) => onRoleSelect(u, e.target.value as UserRole)}
                              title={isSelf ? 'Нельзя менять собственную роль' : 'Сменить роль'}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {u.role === 'teip_admin' ? (
                              (u.teips ?? []).length > 0 ? (
                                <span className="flex flex-wrap gap-1">
                                  {(u.teips ?? []).map((t) => (
                                    <span
                                      key={t.id}
                                      className="whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground"
                                      title="Хранитель модерирует только свой тейп"
                                    >
                                      {t.name}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span
                                  className="text-xs text-danger"
                                  title="У хранителя нет тейпа — он не видит ни одной заявки"
                                >
                                  тейп не указан
                                </span>
                              )
                            ) : u.role === 'super_admin' ? (
                              <span className="text-xs text-muted-foreground">все тейпы</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString('ru-RU', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>
                            {!isSelf && (
                              <button
                                type="button"
                                className={LINK_DANGER}
                                disabled={busyId === u.id}
                                onClick={() => void removeUser(u.id, u.display_name)}
                              >
                                Удалить
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {teipPick && (
        <TeipPickDialog
          userName={teipPick.name}
          onCancel={() => setTeipPick(null)}
          onPick={(teipId) => {
            const uid = teipPick.id;
            setTeipPick(null);
            void changeRole(uid, 'teip_admin', teipId);
          }}
        />
      )}
    </div>
  );
}

/**
 * Диалог выбора тейпа: показывается, когда пользователю без тейпа в профиле
 * назначается роль «Админ тейпа» — хранитель всегда привязан к своему тейпу.
 */
function TeipPickDialog({
  userName,
  onPick,
  onCancel,
}: {
  userName: string;
  onPick: (teipId: number) => void;
  onCancel: () => void;
}) {
  const [teips, setTeips] = useState<Teip[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.teips
      .list()
      .then((list) => {
        if (alive) setTeips(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = q.trim()
    ? teips.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()))
    : teips;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 font-serif text-lg font-semibold text-foreground">
          Назначение хранителя
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          У пользователя «{userName}» не указан тейп. Выберите тейп — хранитель
          будет модерировать только его, тейп сохранится в профиле пользователя.
        </p>
        <input
          type="text"
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          placeholder="Поиск тейпа…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Загрузка тейпов…</p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Ничего не найдено.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                  selected === t.id
                    ? 'bg-accent text-white'
                    : 'bg-transparent text-foreground hover:bg-surface'
                }`}
                onClick={() => setSelected(t.id)}
              >
                {t.name}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={selected == null}
            onClick={() => selected != null && onPick(selected)}
          >
            Назначить
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Карточка «Опубликованные древа»: список всех древ в общей базе с двумя
 * действиями супер-админа — снять с публикации (мягко, данные владельца
 * сохраняются) и удалить полностью (необратимо).
 */
function PublishedTreesCard({ onChanged }: { onChanged?: () => void }) {
  const [trees, setTrees] = useState<AdminTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrees(await api.admin.trees());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки древ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unpublish(t: AdminTree) {
    if (
      !confirm(
        `Снять древо «${t.owner_name}» (${t.count} чел.) с публикации?\n\n` +
          'Древо исчезнет из общей базы, но данные владельца сохранятся — ' +
          'он сможет исправить их и отправить на модерацию заново.',
      )
    )
      return;
    setBusyId(t.owner_id);
    setError(null);
    try {
      await api.admin.unpublishTree(t.owner_id);
      setTrees((prev) => prev.filter((x) => x.owner_id !== t.owner_id));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось снять с публикации');
    } finally {
      setBusyId(null);
    }
  }

  async function removeTree(t: AdminTree) {
    if (
      !confirm(
        `ПОЛНОСТЬЮ удалить древо «${t.owner_name}» (${t.count} чел.)?\n\n` +
          'Все персоны этого пользователя будут безвозвратно удалены из базы. ' +
          'Это действие необратимо!',
      )
    )
      return;
    const answer = prompt(
      `Для подтверждения введите число персон в древе (${t.count}):`,
    );
    if (answer === null) return;
    if (answer.trim() !== String(t.count)) {
      setError('Число не совпало — удаление отменено.');
      return;
    }
    setBusyId(t.owner_id);
    setError(null);
    try {
      await api.admin.deleteTree(t.owner_id);
      setTrees((prev) => prev.filter((x) => x.owner_id !== t.owner_id));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить древо');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 font-serif text-xl font-semibold text-foreground">
          Опубликованные древа
          {trees.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {trees.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Все древа в общей базе. «Снять с публикации» возвращает древо владельцу
        в личное пространство; «Удалить» стирает его из базы безвозвратно.
      </p>

      {error && (
        <div className="mb-3 rounded border border-danger-border bg-danger-bg p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : trees.length === 0 ? (
        <p className="text-muted-foreground">Опубликованных древ пока нет.</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th>Древо</th>
                <th>Владелец</th>
                <th>Контакты</th>
                <th>Тейп</th>
                <th>Персон</th>
                <th>Обновлено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trees.map((t) => (
                <tr key={t.owner_id}>
                  <td className="whitespace-nowrap">
                    {t.root_person_id ? (
                      <Link
                        href={`/trees/${t.root_person_id}`}
                        className="font-semibold text-accent hover:underline"
                        target="_blank"
                      >
                        {t.root_person_name ?? `Древо #${t.owner_id}`}
                      </Link>
                    ) : (
                      <span className="font-semibold text-accent">
                        {t.root_person_name ?? `Древо #${t.owner_id}`}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{t.owner_name}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {t.owner_email ?? t.owner_phone ?? '—'}
                  </td>
                  <td className="whitespace-nowrap">{t.teip_name ?? '—'}</td>
                  <td>{t.count}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {t.published_at
                      ? new Date(t.published_at).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-muted-foreground transition hover:text-foreground hover:underline disabled:opacity-50"
                        disabled={busyId === t.owner_id}
                        onClick={() => void unpublish(t)}
                        title="Древо вернётся владельцу в личное пространство"
                      >
                        Снять с публикации
                      </button>
                      <button
                        type="button"
                        className={LINK_DANGER}
                        disabled={busyId === t.owner_id}
                        onClick={() => void removeTree(t)}
                        title="Безвозвратно удалить все персоны этого древа"
                      >
                        Удалить
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
