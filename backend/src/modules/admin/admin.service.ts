import { query } from '../../db/pool.js';
import { ApiError } from '../../utils/http.js';
import type { UserRole } from '../../middleware/auth.js';

/** Допустимые роли (для валидации смены роли). */
export const ROLES: UserRole[] = ['viewer', 'editor', 'teip_admin', 'super_admin'];

export interface AdminUserRow {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
}

export interface AdminStats {
  users: number;
  persons: number;
  teips: number;
  villages: number;
}

/** Сводные счётчики для обзорной плитки. */
export async function getStats(): Promise<AdminStats> {
  const rows = await query<{ users: string; persons: string; teips: string; villages: string }>(
    `SELECT
       (SELECT COUNT(*) FROM users)    AS users,
       (SELECT COUNT(*) FROM persons)  AS persons,
       (SELECT COUNT(*) FROM teips)    AS teips,
       (SELECT COUNT(*) FROM villages) AS villages`,
  );
  const r = rows[0];
  return {
    users: Number(r.users),
    persons: Number(r.persons),
    teips: Number(r.teips),
    villages: Number(r.villages),
  };
}

/** Все зарегистрированные пользователи (без хеша пароля), новые сверху. */
export async function listUsers(): Promise<AdminUserRow[]> {
  return query<AdminUserRow>(
    `SELECT id, display_name, phone, email, role, created_at
     FROM users
     ORDER BY created_at DESC, id DESC`,
  );
}

/** Сменить роль пользователю. Запрещено менять собственную роль. */
export async function updateUserRole(
  id: number,
  role: UserRole,
  actingUserId: number,
): Promise<void> {
  if (!ROLES.includes(role)) {
    throw new ApiError(400, 'Недопустимая роль');
  }
  if (id === actingUserId) {
    throw new ApiError(400, 'Нельзя менять собственную роль');
  }
  const rows = await query<{ id: number }>(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING id',
    [id, role],
  );
  if (rows.length === 0) throw new ApiError(404, 'Пользователь не найден');
}

/** Удалить пользователя. Запрещено удалять собственный аккаунт. */
export async function deleteUser(id: number, actingUserId: number): Promise<void> {
  if (id === actingUserId) {
    throw new ApiError(400, 'Нельзя удалить собственный аккаунт');
  }
  const rows = await query<{ id: number }>(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id],
  );
  if (rows.length === 0) throw new ApiError(404, 'Пользователь не найден');
}
