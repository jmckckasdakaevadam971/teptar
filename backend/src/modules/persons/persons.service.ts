import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/http.js';
import type { UserRole } from '../../middleware/auth.js';
import type {
  PersonRow,
  CreatePersonInput,
  UpdatePersonInput,
  ListPersonsQuery,
} from './persons.types.js';

/** Кто запрашивает данные — для контроля видимости. */
export interface Viewer {
  userId: number | null;
  role: UserRole | null;
}

export const ANON: Viewer = { userId: null, role: null };

/** Админы (тейпа и супер) видят всё, включая чужие приватные древа. */
export function isAdmin(viewer: Viewer): boolean {
  return viewer.role === 'teip_admin' || viewer.role === 'super_admin';
}

/** Может ли зритель видеть конкретную персону. */
function canView(p: PersonRow, viewer: Viewer): boolean {
  if (isAdmin(viewer)) return true;
  if (viewer.userId && p.created_by === viewer.userId) return true;
  return p.visibility === 'public' && p.status === 'approved';
}

/** Поиск и листинг персон с фильтрами и контролем видимости. */
export async function listPersons(
  params: ListPersonsQuery,
  viewer: Viewer = ANON,
): Promise<PersonRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.q) {
    args.push(`%${params.q}%`);
    where.push(`full_name ILIKE $${args.length}`);
  }
  if (params.teip_id) {
    args.push(params.teip_id);
    where.push(`teip_id = $${args.length}`);
  }
  if (params.village_id) {
    args.push(params.village_id);
    where.push(`village_id = $${args.length}`);
  }
  if (params.status) {
    args.push(params.status);
    where.push(`status = $${args.length}`);
  }

  // Видимость: публике — только общая база (public + approved);
  // авторизованному — плюс всё своё; админам — без ограничений.
  if (!isAdmin(viewer)) {
    if (viewer.userId) {
      args.push(viewer.userId);
      where.push(
        `(visibility = 'public' AND status = 'approved' OR created_by = $${args.length})`,
      );
    } else {
      where.push(`visibility = 'public' AND status = 'approved'`);
    }
  }

  args.push(params.limit, params.offset);
  const sql = `
    SELECT * FROM persons
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY full_name
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  return query<PersonRow>(sql, args);
}

/** Получить персону по id (с проверкой доступа). */
export async function getPerson(id: number, viewer?: Viewer): Promise<PersonRow> {
  const rows = await query<PersonRow>('SELECT * FROM persons WHERE id = $1', [id]);
  if (rows.length === 0) throw new ApiError(404, 'Человек не найден');
  if (viewer && !canView(rows[0], viewer)) throw new ApiError(404, 'Человек не найден');
  return rows[0];
}

/**
 * Проверка на цикл: новый отец/мать не должен быть потомком ребёнка.
 * Иначе образуется петля в графе родства.
 */
async function assertNoCycle(childId: number, parentId: number): Promise<void> {
  const rows = await query<{ id: number }>(
    `
    WITH RECURSIVE descendants AS (
      SELECT id FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id FROM persons p
      JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
    )
    SELECT id FROM descendants WHERE id = $2
    `,
    [childId, parentId],
  );
  if (rows.length > 0) {
    throw new ApiError(409, 'Нельзя назначить потомка родителем (цикл в родстве)');
  }
}

/**
 * Создать персону. Всегда личная (private) и без модерации (approved) —
 * пользователь свободно строит своё древо. В общую базу древо уходит
 * отдельным действием «опубликовать».
 */
export async function createPerson(
  input: CreatePersonInput,
  userId: number | null,
): Promise<PersonRow> {
  return withTransaction(async (client) => {
    const result = await client.query<PersonRow>(
      `
      INSERT INTO persons
        (full_name, gender, birth_year, death_year,
         father_id, mother_id, teip_id, gar_id, village_id,
         note, visibility, status, created_by, approved_by, is_alive)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'private','approved',$11,NULL,$12)
      RETURNING *
      `,
      [
        input.full_name,
        input.gender ?? 'm',
        input.birth_year ?? null,
        input.death_year ?? null,
        input.father_id ?? null,
        input.mother_id ?? null,
        input.teip_id ?? null,
        input.gar_id ?? null,
        input.village_id ?? null,
        input.note ?? null,
        userId,
        input.death_year == null,
      ],
    );

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'create', $3)`,
      [result.rows[0].id, userId, JSON.stringify(input)],
    );

    return result.rows[0];
  });
}

/** Обновить персону. Менять можно только своё древо (или админам). */
export async function updatePerson(
  id: number,
  input: UpdatePersonInput,
  viewer: Viewer,
): Promise<PersonRow> {
  const existing = await getPerson(id); // проверка существования
  if (!isAdmin(viewer) && existing.created_by !== viewer.userId) {
    throw new ApiError(403, 'Можно редактировать только своё древо');
  }

  if (input.father_id) await assertNoCycle(id, input.father_id);
  if (input.mother_id) await assertNoCycle(id, input.mother_id);

  const fields: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    args.push(value);
    fields.push(`${key} = $${args.length}`);
  }
  if (fields.length === 0) return getPerson(id);

  args.push(id);
  const rows = await query<PersonRow>(
    `UPDATE persons SET ${fields.join(', ')} WHERE id = $${args.length} RETURNING *`,
    args,
  );

  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES ($1, $2, 'update', $3)`,
    [id, viewer.userId, JSON.stringify(input)],
  );

  return rows[0];
}

/** Удалить персону. */
export async function deletePerson(id: number): Promise<void> {
  const rows = await query('DELETE FROM persons WHERE id = $1 RETURNING id', [id]);
  if (rows.length === 0) throw new ApiError(404, 'Человек не найден');
}

// ============================================================================
//  ПУБЛИКАЦИЯ ДРЕВА (личное ⇄ общая база) И МОДЕРАЦИЯ
// ============================================================================

export interface TreeStatus {
  total: number;
  private: number;
  pending: number;
  published: number;
  rejected: number;
  state: 'empty' | 'private' | 'pending' | 'published' | 'mixed';
}

/** Текущее состояние своего древа (для ползунка видимости). */
export async function getTreeStatus(userId: number): Promise<TreeStatus> {
  const rows = await query<{
    total: number;
    private: number;
    pending: number;
    published: number;
    rejected: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE visibility = 'private')::int AS private,
       COUNT(*) FILTER (WHERE visibility = 'public' AND status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE visibility = 'public' AND status = 'approved')::int AS published,
       COUNT(*) FILTER (WHERE visibility = 'public' AND status = 'rejected')::int AS rejected
     FROM persons WHERE created_by = $1`,
    [userId],
  );
  const r = rows[0];
  let state: TreeStatus['state'];
  if (r.total === 0) state = 'empty';
  else if (r.pending > 0) state = 'pending';
  else if (r.published > 0) state = r.private > 0 ? 'mixed' : 'published';
  else state = 'private';
  return { ...r, state };
}

/**
 * Опубликовать своё древо в общую базу (уходит на модерацию).
 *  • all         — все мои персоны → public/pending;
 *  • hide_recent — родившиеся < cutoff → public/pending, остальные → private.
 */
export async function publishTree(
  userId: number,
  mode: 'all' | 'hide_recent',
  cutoffYear: number,
): Promise<{ published: number; hidden: number }> {
  return withTransaction(async (client) => {
    const pubArgs: unknown[] = [userId];
    let pubWhere = 'created_by = $1';
    if (mode === 'hide_recent') {
      pubArgs.push(cutoffYear);
      pubWhere += ' AND (birth_year IS NULL OR birth_year < $2)';
    }
    const pub = await client.query(
      `UPDATE persons SET visibility = 'public', status = 'pending', updated_at = now()
       WHERE ${pubWhere} RETURNING id`,
      pubArgs,
    );

    let hiddenCount = 0;
    if (mode === 'hide_recent') {
      const hid = await client.query(
        `UPDATE persons SET visibility = 'private', updated_at = now()
         WHERE created_by = $1 AND birth_year IS NOT NULL AND birth_year >= $2 RETURNING id`,
        [userId, cutoffYear],
      );
      hiddenCount = hid.rowCount ?? 0;
    }

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES (NULL, $1, 'publish', $2)`,
      [userId, JSON.stringify({ mode, cutoffYear, published: pub.rowCount, hidden: hiddenCount })],
    );

    return { published: pub.rowCount ?? 0, hidden: hiddenCount };
  });
}

/** Скрыть своё древо обратно в личное (убрать из общей базы). */
export async function unpublishTree(userId: number): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET visibility = 'private', updated_at = now()
     WHERE created_by = $1 RETURNING id`,
    [userId],
  );
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'unpublish', $2)`,
    [userId, JSON.stringify({ count: rows.length })],
  );
  return { count: rows.length };
}

export interface PendingTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
}

/** Очередь модерации: древа, ожидающие одобрения, сгруппированы по владельцу. */
export async function listPendingTrees(): Promise<PendingTree[]> {
  return query<PendingTree>(
    `SELECT u.id AS owner_id,
            u.display_name AS owner_name,
            COUNT(p.id)::int AS count,
            MIN(p.birth_year) AS min_year,
            MAX(p.birth_year) AS max_year
     FROM persons p
     JOIN users u ON u.id = p.created_by
     WHERE p.visibility = 'public' AND p.status = 'pending'
     GROUP BY u.id, u.display_name
     ORDER BY count DESC`,
  );
}

/**
 * Персоны конкретного древа, ожидающие модерации (для предпросмотра).
 * Сортировка: сначала корни (нет отца), затем по году рождения —
 * чтобы модератору было удобно читать структуру.
 */
export async function getPendingPersons(ownerId: number): Promise<PersonRow[]> {
  return query<PersonRow>(
    `SELECT * FROM persons
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending'
     ORDER BY (father_id IS NOT NULL), COALESCE(birth_year, 9999), full_name`,
    [ownerId],
  );
}

/** Одобрить древо пользователя целиком. */
export async function approveTree(ownerId: number, adminId: number): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET status = 'approved', approved_by = $2, updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
    [ownerId, adminId],
  );
  if (rows.length === 0) throw new ApiError(404, 'Нет древа на модерации у этого пользователя');
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'approve', $2)`,
    [adminId, JSON.stringify({ owner: ownerId, count: rows.length })],
  );
  return { count: rows.length };
}

/** Отклонить древо пользователя — вернуть в личное. */
export async function rejectTree(ownerId: number, adminId: number): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET status = 'rejected', visibility = 'private', updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
    [ownerId, adminId],
  );
  if (rows.length === 0) throw new ApiError(404, 'Нет древа на модерации у этого пользователя');
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'reject', $2)`,
    [adminId, JSON.stringify({ owner: ownerId, count: rows.length })],
  );
  return { count: rows.length };
}
