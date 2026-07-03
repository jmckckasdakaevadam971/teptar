import { query, withTransaction } from '../../db/pool.js';
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
  teips: { id: number; name: string }[];
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
    `SELECT u.id, u.display_name, u.phone, u.email, u.role, u.created_at,
            COALESCE(
              (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
               FROM (SELECT DISTINCT aa.teip_id FROM admin_assignments aa WHERE aa.user_id = u.id) x
               JOIN teips t ON t.id = x.teip_id),
              '[]'::json
            ) AS teips
     FROM users u
     ORDER BY u.created_at DESC, u.id DESC`,
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

// ============================================================================
//  ОПУБЛИКОВАННЫЕ ДРЕВА (управление супер-админа)
// ============================================================================

export interface PublishedTreeRow {
  owner_id: number;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  count: number;
  teip_name: string | null;
  root_person_id: number | null;
  root_person_name: string | null;
  published_at: string | null;
}

/** Все опубликованные (approved) древа с контактами владельцев. */
export async function listPublishedTrees(): Promise<PublishedTreeRow[]> {
  return query<PublishedTreeRow>(
    `
    SELECT owner.owner_id, owner.owner_name, owner.owner_phone, owner.owner_email,
           owner.count, owner.published_at,
           t.name AS teip_name,
           root.id AS root_person_id, root.full_name AS root_person_name
    FROM (
      SELECT p.created_by AS owner_id,
             MAX(u.display_name) AS owner_name,
             MAX(u.phone) AS owner_phone,
             MAX(u.email) AS owner_email,
             COUNT(*)::int AS count,
             MAX(p.updated_at) AS published_at,
             MODE() WITHIN GROUP (ORDER BY p.teip_id) AS teip_id
      FROM persons p
      JOIN users u ON u.id = p.created_by
      WHERE p.visibility = 'public' AND p.status = 'approved'
      GROUP BY p.created_by
    ) owner
    LEFT JOIN teips t ON t.id = owner.teip_id
    LEFT JOIN LATERAL (
      SELECT id, full_name FROM persons
      WHERE created_by = owner.owner_id
        AND visibility = 'public' AND status = 'approved'
      ORDER BY (father_id IS NOT NULL), COALESCE(birth_year, 9999), id
      LIMIT 1
    ) root ON true
    ORDER BY owner.published_at DESC NULLS LAST, owner.owner_id DESC
    `,
  );
}

/**
 * Снять чужое древо с публикации: все публичные персоны владельца становятся
 * приватными. Данные владельца сохраняются — он может исправить и отправить
 * древо на модерацию заново.
 */
export async function unpublishOwnerTree(
  ownerId: number,
  adminId: number,
): Promise<{ count: number }> {
  const rows = await query<{ id: number }>(
    `UPDATE persons SET visibility = 'private', updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' RETURNING id`,
    [ownerId],
  );
  if (rows.length === 0) {
    throw new ApiError(404, 'У пользователя нет опубликованного древа');
  }
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'admin_unpublish', $2)`,
    [adminId, JSON.stringify({ owner: ownerId, count: rows.length })],
  );
  return { count: rows.length };
}

/**
 * Полностью удалить древо пользователя из базы (все его персоны).
 * Связанные записи (change_log, merge_suggestions, tree_merges) удаляются
 * по CASCADE; ссылки father_id из чужих древ обнуляются (SET NULL).
 * Необратимо — черновик у владельца остаётся только в его браузере.
 */
export async function deleteOwnerTree(
  ownerId: number,
  adminId: number,
): Promise<{ count: number }> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: number }>(
      `DELETE FROM persons WHERE created_by = $1 RETURNING id`,
      [ownerId],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new ApiError(404, 'У пользователя нет древа');
    }
    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES (NULL, $1, 'admin_delete_tree', $2)`,
      [adminId, JSON.stringify({ owner: ownerId, count: res.rowCount })],
    );
    return { count: res.rowCount ?? 0 };
  });
}
