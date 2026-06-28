'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ModerationPanel } from '@/components/ModerationPanel/ModerationPanel';
import { BTN_SECONDARY, CARD, LINK_DANGER, ROLE_SELECT, TABLE, TABLE_WRAP } from '@/lib/ui';
import type { AdminStats, AdminUser, UserRole } from '@/lib/types';

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
  const { user, ready } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';
  const canModerate = isSuperAdmin || user?.role === 'teip_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u] = await Promise.all([api.admin.stats(), api.admin.users()]);
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

  async function changeRole(id: number, role: UserRole) {
    setBusyId(id);
    setError(null);
    try {
      await api.admin.setRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сменить роль');
    } finally {
      setBusyId(null);
    }
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
      <div className={CARD}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Админ-панель</h1>
        <p className="text-sand">
          Доступ только для администраторов. Войдите под учётной записью с
          правами модерации.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-cream">Админ-панель</h1>
        <p className="m-0 text-sand">
          {isSuperAdmin
            ? 'Управление пользователями, модерация и обзор данных проекта.'
            : 'Модерация древ, отправленных пользователями в общую базу.'}
        </p>
      </div>

      <ModerationPanel />

      {isSuperAdmin && (
        <>
          {error && (
            <div className="rounded border border-[#5b2c25] bg-[#2a1714] p-[18px] text-[#e08a7a]">
              {error}
            </div>
          )}

          {/* Обзор */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-[14px] border border-line bg-stone-800 p-5 text-center">
                <div className="text-[32px] font-extrabold leading-[1.1] text-gold-light">
                  {stats ? stats[key] : '—'}
                </div>
                <div className="mt-1.5 text-sm text-sand">{label}</div>
              </div>
            ))}
          </div>

          {/* Пользователи */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-xl font-semibold text-cream">Пользователи</h2>
              <button type="button" className={BTN_SECONDARY} onClick={() => void load()} disabled={loading}>
                Обновить
              </button>
            </div>

            {loading ? (
              <p className="text-sand">Загрузка…</p>
            ) : users.length === 0 ? (
              <p className="text-sand">Пользователей пока нет.</p>
            ) : (
              <div className={TABLE_WRAP}>
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Телефон</th>
                      <th>E-mail</th>
                      <th>Роль</th>
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
                            <span className="font-semibold text-gold-light">{u.display_name}</span>
                            {isSelf && <span className="text-xs text-sand"> (вы)</span>}
                          </td>
                          <td className="whitespace-nowrap">{u.phone ?? '—'}</td>
                          <td className="whitespace-nowrap">{u.email ?? '—'}</td>
                          <td>
                            <select
                              className={ROLE_SELECT}
                              value={u.role}
                              disabled={isSelf || busyId === u.id}
                              onChange={(e) => void changeRole(u.id, e.target.value as UserRole)}
                              title={isSelf ? 'Нельзя менять собственную роль' : 'Сменить роль'}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap text-sand">
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
    </div>
  );
}
