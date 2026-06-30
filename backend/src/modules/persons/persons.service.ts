import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { UserRole } from "../../middleware/auth.js";
import type {
  PersonRow,
  CreatePersonInput,
  UpdatePersonInput,
  ListPersonsQuery,
} from "./persons.types.js";

/** Кто запрашивает данные — для контроля видимости. */
export interface Viewer {
  userId: number | null;
  role: UserRole | null;
}

export const ANON: Viewer = { userId: null, role: null };

/** Админы (тейпа и супер) видят всё, включая чужие приватные древа. */
export function isAdmin(viewer: Viewer): boolean {
  return viewer.role === "teip_admin" || viewer.role === "super_admin";
}

/** Может ли зритель видеть конкретную персону. */
function canView(p: PersonRow, viewer: Viewer): boolean {
  if (isAdmin(viewer)) return true;
  if (viewer.userId && p.created_by === viewer.userId) return true;
  return p.visibility === "public" && p.status === "approved";
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
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY full_name
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  return query<PersonRow>(sql, args);
}

/** Получить персону по id (с проверкой доступа). */
export async function getPerson(
  id: number,
  viewer?: Viewer,
): Promise<PersonRow> {
  const rows = await query<PersonRow>("SELECT * FROM persons WHERE id = $1", [
    id,
  ]);
  if (rows.length === 0) throw new ApiError(404, "Человек не найден");
  if (viewer && !canView(rows[0], viewer))
    throw new ApiError(404, "Человек не найден");
  return rows[0];
}

/** Ближайшее окружение персоны: родители, супруги, дети. */
export interface Family {
  person: PersonRow;
  father: PersonRow | null;
  mother: PersonRow | null;
  spouses: PersonRow[];
  children: PersonRow[];
}

/**
 * Семья человека для быстрого обзора рядом с древом.
 * Дети — по отцу или матери; супруги — из браков. Всё с учётом видимости.
 */
export async function getFamily(
  id: number,
  viewer: Viewer = ANON,
): Promise<Family> {
  const person = await getPerson(id, viewer);

  const parentIds = [person.father_id, person.mother_id].filter(
    (x): x is number => x != null,
  );
  const parents = parentIds.length
    ? await query<PersonRow>("SELECT * FROM persons WHERE id = ANY($1)", [
        parentIds,
      ])
    : [];

  const children = await query<PersonRow>(
    `SELECT * FROM persons
     WHERE father_id = $1 OR mother_id = $1
     ORDER BY COALESCE(birth_year, 9999), full_name`,
    [id],
  );

  const spouses = await query<PersonRow>(
    `SELECT p.* FROM marriages m
     JOIN persons p ON p.id = CASE WHEN m.husband_id = $1 THEN m.wife_id ELSE m.husband_id END
     WHERE m.husband_id = $1 OR m.wife_id = $1
     ORDER BY p.full_name`,
    [id],
  );

  const visible = (p: PersonRow | undefined): PersonRow | null =>
    p && canView(p, viewer) ? p : null;

  return {
    person,
    father: visible(parents.find((p) => p.id === person.father_id)),
    mother: visible(parents.find((p) => p.id === person.mother_id)),
    spouses: spouses.filter((p) => canView(p, viewer)),
    children: children.filter((p) => canView(p, viewer)),
  };
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
    throw new ApiError(
      409,
      "Нельзя назначить потомка родителем (цикл в родстве)",
    );
  }
}

/**
 * Создать персону. Всегда личная (private) и без модерации (approved) —
 * пользователь свободно строит своё древо. В общую базу древо уходит
 * отдельным действием «опубликовать».
 */
/**
 * Проверяет, что указанные родители принадлежат тому же пользователю (или он админ).
 * Не даёт добавлять детей в чужое древо или пристыковываться к чужой персоне. */
async function assertOwnsParents(
  fatherId: number | null,
  motherId: number | null,
  viewer: Viewer,
): Promise<void> {
  if (isAdmin(viewer)) return;
  const ids = [fatherId, motherId].filter((x): x is number => !!x);
  if (ids.length === 0) return;
  const rows = await query<{ id: number; created_by: number | null }>(
    "SELECT id, created_by FROM persons WHERE id = ANY($1)",
    [ids],
  );
  for (const r of rows) {
    if (r.created_by !== viewer.userId) {
      throw new ApiError(403, "Нельзя добавлять людей в чужое древо");
    }
  }
}

export async function createPerson(
  input: CreatePersonInput,
  viewer: Viewer,
): Promise<PersonRow> {
  const userId = viewer.userId;
  // Нельзя добавлять людей в чужое древо: родитель должен быть своим (или вы админ).
  await assertOwnsParents(
    input.father_id ?? null,
    input.mother_id ?? null,
    viewer,
  );

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
        input.gender ?? "m",
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

    const created = result.rows[0];

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'create', $3)`,
      [created.id, userId, JSON.stringify(input)],
    );

    return created;
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
    throw new ApiError(403, "Можно редактировать только своё древо");
  }
  // Нельзя привязать свою персону к родителю из чужого древа.
  await assertOwnsParents(
    input.father_id ?? null,
    input.mother_id ?? null,
    viewer,
  );

  if (input.father_id) await assertNoCycle(id, input.father_id);
  if (input.mother_id) await assertNoCycle(id, input.mother_id);

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(input)) {
    const before = (existing as unknown as Record<string, unknown>)[key];
    if (before !== value)
      diff[key] = { from: before ?? null, to: value ?? null };
  }
  if (Object.keys(diff).length === 0) return existing;

  // Если владелец правит уже опубликованную запись — старые данные остаются
  // публичными, а новые значения складываем в pending_diff до одобрения модератором.
  const wasPublic =
    existing.visibility === "public" && existing.status === "approved";
  if (wasPublic && !isAdmin(viewer)) {
    await query(
      `UPDATE persons SET pending_diff = $2, pending_by = $3, pending_at = now() WHERE id = $1`,
      [id, JSON.stringify(input), viewer.userId],
    );
    await query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'update', $3)`,
      [
        id,
        viewer.userId,
        JSON.stringify({ fields: diff, sent_to_review: true }),
      ],
    );
    return existing; // публике по-прежнему видны прежние данные
  }

  const fields: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    args.push(value);
    fields.push(`${key} = $${args.length}`);
  }
  args.push(id);
  const rows = await query<PersonRow>(
    `UPDATE persons SET ${fields.join(", ")} WHERE id = $${args.length} RETURNING *`,
    args,
  );

  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES ($1, $2, 'update', $3)`,
    [
      id,
      viewer.userId,
      JSON.stringify({ fields: diff, sent_to_review: false }),
    ],
  );

  return rows[0];
}

/** Удалить персону. Убирать можно только своё древо (или админам). */
export async function deletePerson(id: number, viewer: Viewer): Promise<void> {
  const existing = await getPerson(id);
  if (!isAdmin(viewer) && existing.created_by !== viewer.userId) {
    throw new ApiError(403, "Удалять можно только своё древо");
  }
  const rows = await query("DELETE FROM persons WHERE id = $1 RETURNING id", [
    id,
  ]);
  if (rows.length === 0) throw new ApiError(404, "Человек не найден");
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
  state: "empty" | "private" | "pending" | "published" | "mixed";
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
  let state: TreeStatus["state"];
  if (r.total === 0) state = "empty";
  else if (r.pending > 0) state = "pending";
  else if (r.published > 0) state = r.private > 0 ? "mixed" : "published";
  else state = "private";
  return { ...r, state };
}

/**
 * Опубликовать своё древо в общую базу (уходит на модерацию).
 *  • all         — все мои персоны → public/pending;
 *  • hide_recent — родившиеся < cutoff → public/pending, остальные → private.
 */
export async function publishTree(
  userId: number,
  mode: "all" | "hide_recent",
  cutoffYear: number,
): Promise<{ published: number; hidden: number }> {
  return withTransaction(async (client) => {
    const pubArgs: unknown[] = [userId];
    let pubWhere = "created_by = $1";
    if (mode === "hide_recent") {
      pubArgs.push(cutoffYear);
      pubWhere += " AND (birth_year IS NULL OR birth_year < $2)";
    }
    const pub = await client.query(
      `UPDATE persons SET visibility = 'public', status = 'pending', updated_at = now()
       WHERE ${pubWhere} RETURNING id`,
      pubArgs,
    );

    let hiddenCount = 0;
    if (mode === "hide_recent") {
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
      [
        userId,
        JSON.stringify({
          mode,
          cutoffYear,
          published: pub.rowCount,
          hidden: hiddenCount,
        }),
      ],
    );

    return { published: pub.rowCount ?? 0, hidden: hiddenCount };
  });
}

/** Скрыть своё древо обратно в личное (убрать из общей базы). */
export async function unpublishTree(
  userId: number,
): Promise<{ count: number }> {
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

/**
 * Полностью удалить своё древо из базы. Используется перед повторной
 * отправкой из редактора `/my`: древо заменяется целиком, а не дополняется,
 * чтобы не плодить дубли. Связанные браки/журнал удаляются по CASCADE.
 */
export async function clearMyTree(userId: number): Promise<{ count: number }> {
  const rows = await query(
    `DELETE FROM persons WHERE created_by = $1 RETURNING id`,
    [userId],
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

/** Владельцы, у кого есть ожидающие правки опубликованных записей. */
export function listEditOwners(): Promise<PendingTree[]> {
  return query<PendingTree>(
    `SELECT u.id AS owner_id, u.display_name AS owner_name,
            COUNT(p.id)::int AS count,
            MIN(p.birth_year) AS min_year, MAX(p.birth_year) AS max_year
     FROM persons p JOIN users u ON u.id = p.created_by
     WHERE p.pending_diff IS NOT NULL
     GROUP BY u.id, u.display_name ORDER BY count DESC`,
  );
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
export async function approveTree(
  ownerId: number,
  adminId: number,
): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET status = 'approved', approved_by = $2, updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
    [ownerId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Нет древа на модерации у этого пользователя");
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'approve', $2)`,
    [adminId, JSON.stringify({ owner: ownerId, count: rows.length })],
  );
  return { count: rows.length };
}

/** Отклонить древо пользователя — вернуть в личное. */
export async function rejectTree(
  ownerId: number,
  adminId: number,
): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET status = 'rejected', visibility = 'private', updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
    [ownerId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Нет древа на модерации у этого пользователя");
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'reject', $2)`,
    [adminId, JSON.stringify({ owner: ownerId, count: rows.length })],
  );
  return { count: rows.length };
}

/** Изменение опубликованной персоны, ожидающее модерации. */
export interface TreeChange {
  person_id: number;
  full_name: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

/** Список ожидающих правок (pending_diff) — старые данные остаются публичными. */
export async function getTreeChanges(ownerId: number): Promise<TreeChange[]> {
  const rows = await query<
    PersonRow & { pending_diff: any; pending_at: string }
  >(
    `SELECT * FROM persons
     WHERE created_by = $1 AND pending_diff IS NOT NULL
     ORDER BY pending_at DESC LIMIT 100`,
    [ownerId],
  );
  return rows.map((p) => {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(p.pending_diff ?? {})) {
      const before = (p as unknown as Record<string, unknown>)[k];
      if (before !== v) diff[k] = { from: before ?? null, to: v ?? null };
    }
    return {
      person_id: p.id,
      full_name: p.full_name,
      diff,
      created_at: p.pending_at,
    };
  });
}

/** Применить ожидающие правки персоны (модератор). */
export async function approveEdit(
  personId: number,
  adminId: number,
): Promise<PersonRow> {
  const rows = await query<PersonRow & { pending_diff: any }>(
    "SELECT * FROM persons WHERE id = $1",
    [personId],
  );
  if (rows.length === 0 || !rows[0].pending_diff)
    throw new ApiError(404, "Нет ожидающих правок");
  const input = rows[0].pending_diff as Record<string, unknown>;
  const fields: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    args.push(v);
    fields.push(`${k} = $${args.length}`);
  }
  args.push(personId);
  const updated = await query<PersonRow>(
    `UPDATE persons SET ${fields.join(", ")}, pending_diff = NULL, pending_by = NULL,
       pending_at = NULL, updated_at = now() WHERE id = $${args.length} RETURNING *`,
    args,
  );
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES ($1, $2, 'approve', $3)`,
    [personId, adminId, JSON.stringify({ applied: input })],
  );
  return updated[0];
}

/** Отклонить ожидающие правки персоны — оставить публичными старые данные. */
export async function rejectEdit(
  personId: number,
  adminId: number,
): Promise<{ rejected: boolean }> {
  const rows = await query(
    `UPDATE persons SET pending_diff = NULL, pending_by = NULL, pending_at = NULL
     WHERE id = $1 AND pending_diff IS NOT NULL RETURNING id`,
    [personId],
  );
  if (rows.length === 0) throw new ApiError(404, "Нет ожидающих правок");
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES ($1, $2, 'reject', '{}')`,
    [personId, adminId],
  );
  return { rejected: true };
}
//  Используется и для «примерного родства», и для поиска дублей.
//  Правило: нечёткое совпадение ФИО (pg_trgm) + тот же тейп + год ±2.
// ============================================================================

export interface SimilarPerson {
  id: number;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  teip_id: number | null;
  teip_name: string | null;
  created_by: number | null;
  owner_name: string | null;
  similarity: number;
}

/** Ключевые поля персоны для сопоставления. */
export interface MatchSeed {
  id: number;
  full_name: string;
  birth_year: number | null;
  teip_id: number | null;
  created_by: number | null;
}

/**
 * Найти похожих людей в ЧУЖИХ древах (другой владелец).
 * statuses — какие статусы целевых персон учитывать (approved и/или pending).
 */
export async function findSimilar(
  seed: MatchSeed,
  statuses: Array<"approved" | "pending">,
): Promise<SimilarPerson[]> {
  if (!seed.teip_id || !seed.full_name) return [];
  return query<SimilarPerson>(
    `
    SELECT p.id, p.full_name, p.birth_year, p.death_year, p.teip_id,
           t.name AS teip_name, p.created_by, u.display_name AS owner_name,
           similarity(p.full_name, $2) AS similarity
    FROM persons p
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN teips t ON t.id = p.teip_id
    WHERE p.id <> $1
      AND p.created_by IS DISTINCT FROM $5
      AND p.visibility = 'public'
      AND p.status = ANY($6)
      AND p.teip_id = $3
      AND p.full_name % $2
      AND ($4::int IS NULL OR p.birth_year IS NULL OR abs(p.birth_year - $4) <= 2)
    ORDER BY similarity DESC
    LIMIT 8
    `,
    [
      seed.id,
      seed.full_name,
      seed.teip_id,
      seed.birth_year,
      seed.created_by,
      statuses,
    ],
  );
}

/** Похожие только среди одобренных (для кросс-древо родства). */
export function findSimilarApproved(seed: MatchSeed): Promise<SimilarPerson[]> {
  return findSimilar(seed, ["approved"]);
}

// ============================================================================
//  КАТАЛОГ ОПУБЛИКОВАННЫХ ДРЕВ («видеть друг друга»)
// ============================================================================

export interface PublicTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
  root_person_id: number | null;
  root_person_name: string | null;
  teip_id: number | null;
  teip_name: string | null;
}

/**
 * Список опубликованных (public + approved) древ, сгруппированный по владельцу.
 * Фильтры: фамилия (q), тейп, село — древо попадаёт в выдачу, если содержит
 * хотя бы одну подходящую персону; статистика считается по всему древу.
 */
export async function listPublicTrees(filters: {
  q?: string;
  teip_id?: number;
  village_id?: number;
}): Promise<PublicTree[]> {
  const match: string[] = [
    `p.visibility = 'public'`,
    `p.status = 'approved'`,
    `p.created_by IS NOT NULL`,
  ];
  const args: unknown[] = [];
  if (filters.teip_id) {
    args.push(filters.teip_id);
    match.push(`p.teip_id = $${args.length}`);
  }
  if (filters.village_id) {
    args.push(filters.village_id);
    match.push(`p.village_id = $${args.length}`);
  }
  if (filters.q) {
    args.push(`%${filters.q}%`);
    match.push(`p.full_name ILIKE $${args.length}`);
  }

  return query<PublicTree>(
    `
    WITH matched_owners AS (
      SELECT DISTINCT p.created_by AS owner_id
      FROM persons p
      WHERE ${match.join(" AND ")}
    ),
    pub AS (
      SELECT p.created_by, p.teip_id, p.birth_year, u.display_name AS owner_name
      FROM persons p
      JOIN users u ON u.id = p.created_by
      WHERE p.visibility = 'public' AND p.status = 'approved'
        AND p.created_by IN (SELECT owner_id FROM matched_owners)
    )
    SELECT owner.owner_id, owner.owner_name, owner.count,
           owner.min_year, owner.max_year,
           root.id AS root_person_id, root.full_name AS root_person_name,
           t.id AS teip_id, t.name AS teip_name
    FROM (
      SELECT created_by AS owner_id,
             MAX(owner_name) AS owner_name,
             COUNT(*)::int AS count,
             MIN(birth_year) AS min_year,
             MAX(birth_year) AS max_year,
             MODE() WITHIN GROUP (ORDER BY teip_id) AS teip_id
      FROM pub
      GROUP BY created_by
    ) owner
    LEFT JOIN teips t ON t.id = owner.teip_id
    LEFT JOIN LATERAL (
      SELECT id, full_name FROM persons
      WHERE created_by = owner.owner_id
        AND visibility = 'public' AND status = 'approved'
      ORDER BY (father_id IS NOT NULL), COALESCE(birth_year, 9999), id
      LIMIT 1
    ) root ON true
    ORDER BY owner.count DESC, owner.owner_name
    LIMIT 100
    `,
    args,
  );
}

// ============================================================================
//  ДУБЛИ МЕЖДУ ДРЕВАМИ И ОБЪЕДИНЕНИЕ (модератор)
// ============================================================================

export interface DuplicatePair {
  person: {
    id: number;
    full_name: string;
    birth_year: number | null;
    death_year: number | null;
  };
  candidate: SimilarPerson;
}

/**
 * Возможные дубли для древа на модерации: каждая pending-персона владельца
 * сверяется с персонами из чужих древ (approved или pending).
 */
export async function findOwnerDuplicates(
  ownerId: number,
): Promise<DuplicatePair[]> {
  const persons = await query<PersonRow>(
    `SELECT * FROM persons
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending'`,
    [ownerId],
  );
  const pairs: DuplicatePair[] = [];
  for (const p of persons) {
    const candidates = await findSimilar(
      {
        id: p.id,
        full_name: p.full_name,
        birth_year: p.birth_year,
        teip_id: p.teip_id,
        created_by: ownerId,
      },
      ["approved", "pending"],
    );
    for (const candidate of candidates) {
      pairs.push({
        person: {
          id: p.id,
          full_name: p.full_name,
          birth_year: p.birth_year,
          death_year: p.death_year,
        },
        candidate,
      });
    }
  }
  return pairs;
}

/**
 * Объединить две записи: keep остаётся, drop удаляется.
 * Дети и браки drop перепривязываются на keep. Так два древа связываются.
 */
export async function mergePersons(
  keepId: number,
  dropId: number,
  adminId: number,
): Promise<{ merged: boolean }> {
  if (keepId === dropId) {
    throw new ApiError(400, "Нельзя объединить запись саму с собой");
  }
  return withTransaction(async (client) => {
    const both = await client.query<{ id: number }>(
      "SELECT id FROM persons WHERE id = ANY($1)",
      [[keepId, dropId]],
    );
    if (both.rows.length < 2)
      throw new ApiError(404, "Одна из записей не найдена");

    // Перепривязать детей с drop на keep (но не сделать keep своим родителем).
    await client.query(
      "UPDATE persons SET father_id = $1 WHERE father_id = $2 AND id <> $1",
      [keepId, dropId],
    );
    await client.query(
      "UPDATE persons SET mother_id = $1 WHERE mother_id = $2 AND id <> $1",
      [keepId, dropId],
    );

    // Перенести браки, избегая дублей и самобрака.
    await client.query(
      `UPDATE marriages mm SET husband_id = $1
       WHERE mm.husband_id = $2 AND mm.wife_id <> $1
         AND NOT EXISTS (SELECT 1 FROM marriages m WHERE m.husband_id = $1 AND m.wife_id = mm.wife_id)`,
      [keepId, dropId],
    );
    await client.query(
      `UPDATE marriages mm SET wife_id = $1
       WHERE mm.wife_id = $2 AND mm.husband_id <> $1
         AND NOT EXISTS (SELECT 1 FROM marriages m WHERE m.wife_id = $1 AND m.husband_id = mm.husband_id)`,
      [keepId, dropId],
    );

    // Удалить дубль (оставшиеся его браки уйдут каскадом).
    await client.query("DELETE FROM persons WHERE id = $1", [dropId]);

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'merge', $3)`,
      [keepId, adminId, JSON.stringify({ keep: keepId, drop: dropId })],
    );
    return { merged: true };
  });
}
