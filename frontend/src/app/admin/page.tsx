'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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

  const isAdmin = user?.role === 'super_admin';

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
    if (ready && isAdmin) void load();
    else if (ready) setLoading(false);
  }, [ready, isAdmin, load]);

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

  if (!ready) return <div className="card">Загрузка…</div>;

  if (!isAdmin) {
    return (
      <div className="card">
        <h1>Админ-панель</h1>
        <p style={{ color: '#64748b' }}>
          Доступ только для супер-администратора. Войдите под учётной записью с
          соответствующими правами.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1>Админ-панель</h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Управление пользователями и обзор данных проекта.
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* Обзор */}
      <div className="stat-grid">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="stat-card">
            <div className="stat-value">{stats ? stats[key] : '—'}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Пользователи */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Пользователи</h2>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Обновить
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#64748b' }}>Загрузка…</p>
        ) : users.length === 0 ? (
          <p style={{ color: '#64748b' }}>Пользователей пока нет.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
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
                      <td>
                        {u.display_name}
                        {isSelf && <span className="self-tag"> (вы)</span>}
                      </td>
                      <td>{u.phone ?? '—'}</td>
                      <td>{u.email ?? '—'}</td>
                      <td>
                        <select
                          className="role-select"
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
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
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
                            className="link-btn danger"
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
    </div>
  );
}
