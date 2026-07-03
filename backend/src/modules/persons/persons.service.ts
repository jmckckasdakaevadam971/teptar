import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { UserRole } from "../../middleware/auth.js";
import type {
  PersonRow,
  CreatePersonInput,
  UpdatePersonInput,
  ListPersonsQuery,
  BulkPersonInput,
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

// ============================================================================
//  МОДЕРАЦИЯ ПО ТЕЙПАМ
//  Хранитель (teip_admin) с закреплёнными тейпами видит и решает только
//  заявки своих тейпов. Без закреплений — общий модератор (видит всё).
// ============================================================================

/** Тейпы модератора. null = без ограничений (супер-админ или общий модератор). */
export async function getModeratorTeipIds(
  viewer: Viewer,
): Promise<number[] | null> {
  if (viewer.role !== "teip_admin" || viewer.userId == null) return null;
  const rows = await query<{ teip_id: number }>(
    "SELECT DISTINCT teip_id FROM admin_assignments WHERE user_id = $1",
    [viewer.userId],
  );
  if (rows.length === 0) return null;
  return rows.map((r) => r.teip_id);
}

const TEIP_SCOPE_ERROR = "Этот тейп не закреплён за вами";

/** Древо владельца относится к тейпам модератора? (хотя бы одна персона) */
export async function assertOwnerInTeips(
  ownerId: number,
  teipIds: number[] | null,
): Promise<void> {
  if (!teipIds) return;
  const rows = await query(
    "SELECT 1 FROM persons WHERE created_by = $1 AND teip_id = ANY($2) LIMIT 1",
    [ownerId, teipIds],
  );
  if (rows.length === 0) throw new ApiError(403, TEIP_SCOPE_ERROR);
}

/** Персона относится к тейпам модератора? */
export async function assertPersonInTeips(
  personId: number,
  teipIds: number[] | null,
): Promise<void> {
  if (!teipIds) return;
  const rows = await query(
    "SELECT 1 FROM persons WHERE id = $1 AND teip_id = ANY($2) LIMIT 1",
    [personId, teipIds],
  );
  if (rows.length === 0) throw new ApiError(403, TEIP_SCOPE_ERROR);
}

/** Предложение объединения затрагивает тейпы модератора? */
export async function assertSuggestionInTeips(
  suggestionId: number,
  teipIds: number[] | null,
): Promise<void> {
  if (!teipIds) return;
  const rows = await query(
    `SELECT 1 FROM merge_suggestions ms
     JOIN persons pa ON pa.id = ms.person_a_id
     JOIN persons pb ON pb.id = ms.person_b_id
     WHERE ms.id = $1 AND (pa.teip_id = ANY($2) OR pb.teip_id = ANY($2))
     LIMIT 1`,
    [suggestionId, teipIds],
  );
  if (rows.length === 0) throw new ApiError(403, TEIP_SCOPE_ERROR);
}

/** Объединённое древо затрагивает тейпы модератора? */
export async function assertTreeMergeInTeips(
  mergeId: number,
  teipIds: number[] | null,
): Promise<void> {
  if (!teipIds) return;
  const rows = await query(
    `SELECT 1 FROM tree_merges tm
     JOIN persons pa ON pa.id = tm.anchor_a_id
     JOIN persons pb ON pb.id = tm.anchor_b_id
     WHERE tm.id = $1 AND (pa.teip_id = ANY($2) OR pb.teip_id = ANY($2))
     LIMIT 1`,
    [mergeId, teipIds],
  );
  if (rows.length === 0) throw new ApiError(403, TEIP_SCOPE_ERROR);
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
  /** Комментарий модератора к последнему отклонению (если было). */
  reject_reason: string | null;
  /** Когда древо отклонили в последний раз. */
  rejected_at: string | null;
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

  // Последняя причина отклонения — показываем автору, пока он не отправил
  // древо на модерацию повторно и оно не было одобрено.
  let rejectReason: string | null = null;
  let rejectedAt: string | null = null;
  if (state !== "pending" && state !== "published" && r.total > 0) {
    const lastReject = await query<{ reason: string | null; created_at: string }>(
      `SELECT diff->>'reason' AS reason, created_at
       FROM change_log
       WHERE action = 'reject' AND (diff->>'owner')::bigint = $1
         AND created_at > COALESCE(
           (SELECT max(created_at) FROM change_log
            WHERE action = 'approve' AND (diff->>'owner')::bigint = $1),
           'epoch'::timestamptz)
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (lastReject.length > 0) {
      rejectReason = lastReject[0].reason;
      rejectedAt = lastReject[0].created_at;
    }
  }

  return { ...r, state, reject_reason: rejectReason, rejected_at: rejectedAt };
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

/**
 * Пакетная замена своего древа за одну транзакцию, разрешая родителя по
 * temp_id из этого же пакета. Новая версия помечается visibility='public',
 * status='pending' (на модерацию). ВАЖНО: уже одобренное публичное древо
 * НЕ удаляется — оно остаётся видимым в общей базе, пока модератор не
 * одобрит новую версию (тогда approveTree заменит старую на новую).
 */
export async function replaceTree(
  userId: number,
  persons: BulkPersonInput[],
): Promise<{ count: number }> {
  return withTransaction(async (client) => {
    // Удаляем ТОЛЬКО прежнюю неодобренную версию (pending/rejected),
    // чтобы не плодить дубли. Одобренное (approved) остаётся публичным.
    await client.query(
      `DELETE FROM persons WHERE created_by = $1 AND status <> 'approved'`,
      [userId],
    );

    const byTemp = new Map(persons.map((p) => [p.temp_id, p]));
    const idMap = new Map<string, number>();
    const visiting = new Set<string>();

    // Вставляем персону, предварительно (рекурсивно) создав её родителя,
    // чтобы father_id ссылался на уже существующую запись. visiting ловит
    // случайные циклы во входных данных и обрывает их (родитель → null).
    const insertOne = async (p: BulkPersonInput): Promise<number> => {
      const existing = idMap.get(p.temp_id);
      if (existing != null) return existing;

      let fatherId: number | null = null;
      if (p.parent_temp_id && !visiting.has(p.parent_temp_id)) {
        const parent = byTemp.get(p.parent_temp_id);
        if (parent) {
          visiting.add(p.temp_id);
          fatherId = await insertOne(parent);
          visiting.delete(p.temp_id);
        }
      }

      const res = await client.query<{ id: number }>(
        `
        INSERT INTO persons
          (full_name, gender, birth_year, death_year,
           father_id, mother_id, teip_id, gar_id, village_id,
           note, spouse_names, visibility, status, created_by, approved_by, is_alive)
        VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,'public','pending',$11,NULL,$12)
        RETURNING id
        `,
        [
          p.full_name,
          p.gender ?? "m",
          p.birth_year ?? null,
          p.death_year ?? null,
          fatherId,
          p.teip_id ?? null,
          p.gar_id ?? null,
          p.village_id ?? null,
          p.note ?? null,
          p.spouse_names && p.spouse_names.length ? p.spouse_names : null,
          userId,
          p.death_year == null,
        ],
      );
      const id = Number(res.rows[0].id);
      idMap.set(p.temp_id, id);
      return id;
    };

    for (const p of persons) await insertOne(p);

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES (NULL, $1, 'publish', $2)`,
      [userId, JSON.stringify({ mode: "bulk_replace", count: persons.length })],
    );

    return { count: persons.length };
  });
}

/** Существенное пересечение pending-древа с чужим древом (маркер дубликата). */
export interface PendingTreeDuplicate {
  owner_id: number;
  owner_name: string;
  /** Сколько людей из очереди совпало с людьми этого владельца. */
  matched: number;
  /** true — чужое древо уже опубликовано; false — тоже ждёт модерации. */
  published: boolean;
}

export interface PendingTree {
  owner_id: number;
  owner_name: string;
  count: number;
  min_year: number | null;
  max_year: number | null;
  /** Если древо во многом повторяет чужое — кого именно. */
  duplicate?: PendingTreeDuplicate | null;
}

/** Владельцы, у кого есть ожидающие правки опубликованных записей. */
export function listEditOwners(
  teipIds: number[] | null = null,
): Promise<PendingTree[]> {
  return query<PendingTree>(
    `SELECT u.id AS owner_id, u.display_name AS owner_name,
            COUNT(p.id)::int AS count,
            MIN(p.birth_year) AS min_year, MAX(p.birth_year) AS max_year
     FROM persons p JOIN users u ON u.id = p.created_by
     WHERE p.pending_diff IS NOT NULL
     GROUP BY u.id, u.display_name
     HAVING $1::bigint[] IS NULL OR bool_or(p.teip_id = ANY($1))
     ORDER BY count DESC`,
    [teipIds],
  );
}

/** Очередь модерации: древа, ожидающие одобрения, сгруппированы по владельцу. */
export async function listPendingTrees(
  teipIds: number[] | null = null,
): Promise<PendingTree[]> {
  const trees = await query<PendingTree>(
    `SELECT u.id AS owner_id,
            u.display_name AS owner_name,
            COUNT(p.id)::int AS count,
            MIN(p.birth_year) AS min_year,
            MAX(p.birth_year) AS max_year
     FROM persons p
     JOIN users u ON u.id = p.created_by
     WHERE p.visibility = 'public' AND p.status = 'pending'
     GROUP BY u.id, u.display_name
     HAVING $1::bigint[] IS NULL OR bool_or(p.teip_id = ANY($1))
     ORDER BY count DESC`,
    [teipIds],
  );
  if (trees.length === 0) return trees;

  // Помечаем древа, во многом повторяющие чужие (уже опубликованные или тоже
  // в очереди): совпадение имени (pg_trgm), тот же тейп, год рождения ±2.
  // Для каждого владельца берём чужое древо с наибольшим пересечением.
  const overlaps = await query<{
    owner_id: number;
    dup_owner_id: number;
    dup_owner_name: string;
    matched: number;
    published: boolean;
  }>(
    `WITH matches AS (
       SELECT p.created_by AS owner_id,
              p.id AS person_id,
              o.created_by AS other_owner,
              o.status AS other_status
       FROM persons p
       JOIN persons o
         ON o.created_by <> p.created_by
        AND o.visibility = 'public'
        AND o.status IN ('approved', 'pending')
        AND o.teip_id = p.teip_id
        AND o.full_name % p.full_name
        AND (p.birth_year IS NULL OR o.birth_year IS NULL
             OR abs(o.birth_year - p.birth_year) <= 2)
       WHERE p.visibility = 'public' AND p.status = 'pending'
         AND p.teip_id IS NOT NULL
         AND p.created_by = ANY($1)
     ),
     per_other AS (
       SELECT owner_id, other_owner,
              COUNT(DISTINCT person_id)::int AS matched,
              bool_or(other_status = 'approved') AS published
       FROM matches
       GROUP BY owner_id, other_owner
     )
     SELECT DISTINCT ON (po.owner_id)
            po.owner_id,
            po.other_owner AS dup_owner_id,
            u.display_name AS dup_owner_name,
            po.matched,
            po.published
     FROM per_other po
     JOIN users u ON u.id = po.other_owner
     ORDER BY po.owner_id, po.matched DESC`,
    [trees.map((t) => t.owner_id)],
  );

  const byOwner = new Map(overlaps.map((o) => [o.owner_id, o]));
  for (const tree of trees) {
    const o = byOwner.get(tree.owner_id);
    // Дубликатом считаем, когда совпала хотя бы половина древа (и минимум 2
    // человека) — частичный переклик предков это норма, его ловят объединения.
    if (o && o.matched >= 2 && o.matched * 2 >= tree.count) {
      tree.duplicate = {
        owner_id: o.dup_owner_id,
        owner_name: o.dup_owner_name,
        matched: o.matched,
        published: o.published,
      };
    } else {
      tree.duplicate = null;
    }
  }
  return trees;
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

/** Контакт владельца древа — для почтовых уведомлений о модерации. */
export async function getOwnerContact(
  ownerId: number,
): Promise<{ email: string | null; display_name: string } | null> {
  const rows = await query<{ email: string | null; display_name: string }>(
    `SELECT email, display_name FROM users WHERE id = $1`,
    [ownerId],
  );
  return rows[0] ?? null;
}

/**
 * Одобрить древо пользователя целиком. Если у него уже была одобренная
 * версия — она заменяется новой (старая удаляется в той же транзакции).
 */
export async function approveTree(
  ownerId: number,
  adminId: number,
): Promise<{ count: number }> {
  return withTransaction(async (client) => {
    // Есть ли новая версия на модерации?
    const pending = await client.query<{ id: number }>(
      `SELECT id FROM persons
       WHERE created_by = $1 AND visibility = 'public' AND status = 'pending'`,
      [ownerId],
    );
    if (pending.rowCount === 0)
      throw new ApiError(404, "Нет древа на модерации у этого пользователя");

    // Убираем прежнюю одобренную версию — её заменяет новая.
    await client.query(
      `DELETE FROM persons WHERE created_by = $1 AND status = 'approved'`,
      [ownerId],
    );

    // Новую версию делаем одобренной (публичной).
    const rows = await client.query(
      `UPDATE persons SET status = 'approved', approved_by = $2, updated_at = now()
       WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
      [ownerId, adminId],
    );

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES (NULL, $1, 'approve', $2)`,
      [adminId, JSON.stringify({ owner: ownerId, count: rows.rowCount })],
    );

    return { count: rows.rowCount ?? 0 };
  });
}

/** Отклонить древо пользователя — вернуть в личное (с комментарием автору). */
export async function rejectTree(
  ownerId: number,
  adminId: number,
  reason?: string | null,
): Promise<{ count: number }> {
  const rows = await query(
    `UPDATE persons SET status = 'rejected', visibility = 'private', updated_at = now()
     WHERE created_by = $1 AND visibility = 'public' AND status = 'pending' RETURNING id`,
    [ownerId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Нет древа на модерации у этого пользователя");
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'reject', $2)`,
    [
      adminId,
      JSON.stringify({
        owner: ownerId,
        count: rows.length,
        reason: reason?.trim() || null,
      }),
    ],
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
  /** Имя отца кандидата (если указан в его древе). */
  father_name: string | null;
  /** Сходство имён отцов, если отцы известны у ОБЕИХ сторон; иначе null. */
  father_similarity: number | null;
}

/** Ключевые поля персоны для сопоставления. */
export interface MatchSeed {
  id: number;
  full_name: string;
  birth_year: number | null;
  teip_id: number | null;
  created_by: number | null;
  /** Имя отца искомой персоны — для сверки отцов (опционально). */
  father_name?: string | null;
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
           similarity(p.full_name, $2) AS similarity,
           f.full_name AS father_name,
           CASE
             WHEN f.full_name IS NOT NULL AND $7::text IS NOT NULL
             THEN similarity(f.full_name, $7::text)
             ELSE NULL
           END AS father_similarity
    FROM persons p
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN teips t ON t.id = p.teip_id
    LEFT JOIN persons f ON f.id = p.father_id
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
      seed.father_name ?? null,
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

// ============================================================================
//  ОЧЕРЕДЬ ПРЕДЛОЖЕНИЙ ОБЪЕДИНЕНИЯ (авто-поиск + модерация)
// ============================================================================

/**
 * Пороги строгого подбора якоря (общего предка двух древ).
 * Логика: сходство имени — базовый сигнал, отец и год рождения — подтверждения.
 *  • есть хотя бы одно подтверждение (отец совпал ИЛИ оба года указаны и близки)
 *    → достаточно ANCHOR_MIN_SIMILARITY;
 *  • подтверждений нет (нет отцов для сверки и хотя бы один год не указан)
 *    → имя должно совпадать почти точно: ANCHOR_STRICT_SIMILARITY;
 *  • отцы известны у обеих сторон, но их имена НЕ похожи
 *    → кандидат отбрасывается, какое бы похожее имя ни было (это разные люди).
 */
const ANCHOR_MIN_SIMILARITY = 0.62;
const ANCHOR_STRICT_SIMILARITY = 0.82;
const FATHER_MIN_SIMILARITY = 0.45;

/**
 * Найти точки пересечения древа владельца с ЧУЖИМИ древами и поставить в
 * очередь ОДНО предложение на каждую пару древ — по самому надёжному общему
 * предку (якорю). Именно по нему потом древа срастаются в одно.
 *
 * Почему один якорь, а не все похожие имена: у двух пересекающихся древ
 * совпадает конкретный предок, а его потомки (например, родные братья)
 * похожи лишь отчества́ми — их объединять НЕЛЬЗЯ. Поэтому берём только самое
 * сильное совпадение на пару владельцев.
 *
 * Вызывается автоматически при отправке древа и при его одобрении.
 */
export async function generateMergeSuggestionsForOwner(
  ownerId: number,
): Promise<{ created: number }> {
  const persons = await query<PersonRow>(
    `SELECT * FROM persons
     WHERE created_by = $1 AND visibility = 'public'
       AND status IN ('approved', 'pending')`,
    [ownerId],
  );

  // Имя отца внутри своего же древа — для сверки отцов с кандидатами.
  const nameById = new Map<number, string>(
    persons.map((p) => [p.id, p.full_name]),
  );

  // Лучший якорь на каждого чужого владельца: otherOwnerId → пара + оценка.
  // score = сходство имени + бонус за подтверждения (отец, год) — чтобы при
  // равных именах побеждал кандидат с бо́льшим числом подтверждений.
  const best = new Map<
    number,
    {
      ownerPersonId: number;
      otherPersonId: number;
      similarity: number;
      score: number;
    }
  >();

  for (const p of persons) {
    const fatherName = p.father_id ? (nameById.get(p.father_id) ?? null) : null;
    const candidates = await findSimilar(
      {
        id: p.id,
        full_name: p.full_name,
        birth_year: p.birth_year,
        teip_id: p.teip_id,
        created_by: ownerId,
        father_name: fatherName,
      },
      ["approved", "pending"],
    );
    for (const c of candidates) {
      if (c.created_by == null) continue;

      // Сверка отцов: оба известны, но не похожи → это разные люди.
      const fatherChecked = c.father_similarity !== null;
      const fatherOk =
        fatherChecked && (c.father_similarity ?? 0) >= FATHER_MIN_SIMILARITY;
      if (fatherChecked && !fatherOk) continue;

      // Год рождения: SQL уже отсёк расхождение > 2 лет,
      // подтверждением считаем только случай «оба года указаны».
      const yearOk = p.birth_year !== null && c.birth_year !== null;

      const confirmations = (fatherOk ? 1 : 0) + (yearOk ? 1 : 0);
      const minSim =
        confirmations > 0 ? ANCHOR_MIN_SIMILARITY : ANCHOR_STRICT_SIMILARITY;
      if (c.similarity < minSim) continue;

      const score = c.similarity + confirmations * 0.1;
      const cur = best.get(c.created_by);
      if (!cur || score > cur.score) {
        best.set(c.created_by, {
          ownerPersonId: p.id,
          otherPersonId: c.id,
          similarity: c.similarity,
          score,
        });
      }
    }
  }

  // Обновляем очередь: сносим прежние НЕобработанные предложения этого древа
  // (чтобы не копить устаревшие), затем вставляем по одному лучшему якорю.
  // Ранее отклонённые (dismissed) пары не воскресают — ON CONFLICT DO NOTHING.
  return withTransaction(async (client) => {
    await client.query(
      `DELETE FROM merge_suggestions
       WHERE status = 'pending'
         AND (person_a_id IN (SELECT id FROM persons WHERE created_by = $1)
           OR person_b_id IN (SELECT id FROM persons WHERE created_by = $1))`,
      [ownerId],
    );

    let created = 0;
    for (const m of best.values()) {
      const a = Math.min(m.ownerPersonId, m.otherPersonId);
      const b = Math.max(m.ownerPersonId, m.otherPersonId);
      const rows = await client.query<{ id: number }>(
        `INSERT INTO merge_suggestions (person_a_id, person_b_id, similarity)
         VALUES ($1, $2, $3)
         ON CONFLICT (person_a_id, person_b_id) DO NOTHING
         RETURNING id`,
        [a, b, m.similarity],
      );
      if (rows.rowCount) created += 1;
    }
    return { created };
  });
}

/** Общий предок (якорь) одного из двух древ — с контекстом для мини-схемы. */
export interface MergeAnchor {
  id: number;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  note: string | null;
  teip_name: string | null;
  /** Отец якоря (ветка вверх) — для наглядности. */
  father_name: string | null;
  /** Прямые дети якоря (ветка вниз) — они и «переедут» под общий предок. */
  children: { id: number; full_name: string; birth_year: number | null }[];
}

/** Владелец древа. */
export interface MergeParty {
  owner_id: number | null;
  owner_name: string | null;
}

export interface MergeSuggestion {
  id: number;
  similarity: number;
  owner_a: MergeParty;
  owner_b: MergeParty;
  anchor_a: MergeAnchor;
  anchor_b: MergeAnchor;
}

/** Список необработанных предложений объединения древ (для модератора). */
export async function listMergeSuggestions(
  teipIds: number[] | null = null,
): Promise<MergeSuggestion[]> {
  const rows = await query<Record<string, unknown>>(
    `
    SELECT ms.id, ms.similarity,
           pa.id AS a_id, pa.full_name AS a_name, pa.birth_year AS a_birth,
           pa.death_year AS a_death, pa.note AS a_note, ta.name AS a_teip,
           fa.full_name AS a_father,
           pa.created_by AS a_owner_id, ua.display_name AS a_owner_name,
           pb.id AS b_id, pb.full_name AS b_name, pb.birth_year AS b_birth,
           pb.death_year AS b_death, pb.note AS b_note, tb.name AS b_teip,
           fb.full_name AS b_father,
           pb.created_by AS b_owner_id, ub.display_name AS b_owner_name
    FROM merge_suggestions ms
    JOIN persons pa ON pa.id = ms.person_a_id
    JOIN persons pb ON pb.id = ms.person_b_id
    LEFT JOIN teips   ta ON ta.id = pa.teip_id
    LEFT JOIN teips   tb ON tb.id = pb.teip_id
    LEFT JOIN users   ua ON ua.id = pa.created_by
    LEFT JOIN users   ub ON ub.id = pb.created_by
    LEFT JOIN persons fa ON fa.id = pa.father_id
    LEFT JOIN persons fb ON fb.id = pb.father_id
    WHERE ms.status = 'pending'
      AND ($1::bigint[] IS NULL
           OR pa.teip_id = ANY($1) OR pb.teip_id = ANY($1))
    ORDER BY ms.similarity DESC, ms.id DESC
    LIMIT 200
    `,
    [teipIds],
  );

  // Одним запросом подтягиваем прямых детей всех якорей (ветка вниз).
  const anchorIds = rows.flatMap((r) => [Number(r.a_id), Number(r.b_id)]);
  const childrenByParent = new Map<
    number,
    { id: number; full_name: string; birth_year: number | null }[]
  >();
  if (anchorIds.length) {
    const kids = await query<{
      father_id: number;
      id: number;
      full_name: string;
      birth_year: number | null;
    }>(
      `SELECT father_id, id, full_name, birth_year FROM persons
       WHERE father_id = ANY($1)
       ORDER BY COALESCE(birth_year, 9999), full_name`,
      [anchorIds],
    );
    for (const k of kids) {
      const parentId = Number(k.father_id);
      const list = childrenByParent.get(parentId) ?? [];
      list.push({
        id: Number(k.id),
        full_name: k.full_name,
        birth_year: k.birth_year == null ? null : Number(k.birth_year),
      });
      childrenByParent.set(parentId, list);
    }
  }

  const anchor = (
    id: number,
    name: unknown,
    birth: unknown,
    death: unknown,
    note: unknown,
    teip: unknown,
    father: unknown,
  ): MergeAnchor => ({
    id,
    full_name: String(name),
    birth_year: birth == null ? null : Number(birth),
    death_year: death == null ? null : Number(death),
    note: (note as string) ?? null,
    teip_name: (teip as string) ?? null,
    father_name: (father as string) ?? null,
    children: childrenByParent.get(id) ?? [],
  });

  return rows.map((r) => ({
    id: Number(r.id),
    similarity: Number(r.similarity),
    owner_a: {
      owner_id: r.a_owner_id == null ? null : Number(r.a_owner_id),
      owner_name: (r.a_owner_name as string) ?? null,
    },
    owner_b: {
      owner_id: r.b_owner_id == null ? null : Number(r.b_owner_id),
      owner_name: (r.b_owner_name as string) ?? null,
    },
    anchor_a: anchor(
      Number(r.a_id),
      r.a_name,
      r.a_birth,
      r.a_death,
      r.a_note,
      r.a_teip,
      r.a_father,
    ),
    anchor_b: anchor(
      Number(r.b_id),
      r.b_name,
      r.b_birth,
      r.b_death,
      r.b_note,
      r.b_teip,
      r.b_father,
    ),
  }));
}

/** Поля общего предка, которые модератор может задать при слиянии. */
export interface MergeOverrides {
  full_name?: string;
  birth_year?: number | null;
  death_year?: number | null;
  note?: string | null;
}

/**
 * Применить предложение НЕРАЗРУШИТЕЛЬНО: не трогаем исходные древа, а создаём
 * связь-объединение (tree_merges) двух якорей = один общий предок. Общее древо
 * собирается «на лету» из обеих веток и уходит на повторную модерацию
 * (status pending); публичным становится после одобрения.
 *
 * keepId выбирает, чьи поля предка станут «шапкой» общего древа по умолчанию;
 * overrides позволяют модератору задать их вручную. Предложение помечается
 * как обработанное (merged) и уходит из очереди.
 */
export async function resolveMergeSuggestion(
  suggestionId: number,
  keepId: number,
  adminId: number,
  overrides?: MergeOverrides,
): Promise<{ merged: boolean; tree_merge_id: number }> {
  const rows = await query<{ person_a_id: number; person_b_id: number }>(
    `SELECT person_a_id, person_b_id FROM merge_suggestions
     WHERE id = $1 AND status = 'pending'`,
    [suggestionId],
  );
  if (rows.length === 0) throw new ApiError(404, "Предложение не найдено");

  const a = Number(rows[0].person_a_id);
  const b = Number(rows[0].person_b_id);
  if (keepId !== a && keepId !== b)
    throw new ApiError(400, "keep_id не относится к этому предложению");

  // Поля «шапки» общего предка: берём из overrides, иначе из выбранной записи.
  const keep = await query<PersonRow>(`SELECT * FROM persons WHERE id = $1`, [
    keepId,
  ]);
  if (keep.length === 0) throw new ApiError(404, "Одна из записей не найдена");
  const base = keep[0];
  const name =
    overrides?.full_name != null && overrides.full_name.trim()
      ? overrides.full_name.trim()
      : base.full_name;
  const birth =
    overrides?.birth_year !== undefined
      ? overrides.birth_year
      : base.birth_year;
  const death =
    overrides?.death_year !== undefined
      ? overrides.death_year
      : base.death_year;
  const note = overrides?.note !== undefined ? overrides.note : base.note;

  return withTransaction(async (client) => {
    // Связь пары якорей — одна на пару (a<b гарантирован порядком suggestion).
    const ins = await client.query<{ id: number }>(
      `INSERT INTO tree_merges
         (anchor_a_id, anchor_b_id, merged_name, merged_birth_year,
          merged_death_year, merged_note, status, proposed_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       ON CONFLICT (anchor_a_id, anchor_b_id) DO UPDATE
         SET merged_name = EXCLUDED.merged_name,
             merged_birth_year = EXCLUDED.merged_birth_year,
             merged_death_year = EXCLUDED.merged_death_year,
             merged_note = EXCLUDED.merged_note,
             status = 'pending',
             proposed_by = EXCLUDED.proposed_by,
             approved_by = NULL,
             resolved_at = NULL,
             created_at = now()
       RETURNING id`,
      [a, b, name, birth, death, note, adminId],
    );

    await client.query(
      `UPDATE merge_suggestions
       SET status = 'merged', resolved_by = $2, resolved_at = now()
       WHERE id = $1`,
      [suggestionId, adminId],
    );

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'merge', $3)`,
      [keepId, adminId, JSON.stringify({ anchor_a: a, anchor_b: b })],
    );

    return { merged: true, tree_merge_id: Number(ins.rows[0].id) };
  });
}

// ============================================================================
//  ОБЪЕДИНЁННЫЕ ДРЕВА: очередь повторной модерации и публичный каталог
// ============================================================================

/** Одна сторона (ветка) объединённого древа для карточки модератора. */
export interface MergeBranch {
  anchor_id: number;
  anchor_name: string;
  owner_id: number | null;
  owner_name: string | null;
  teip_name: string | null;
  /** Сколько персон в этой ветке (предок + потомки). */
  size: number;
}

/** Объединённое древо (связь двух веток) — для очереди и каталога. */
export interface TreeMerge {
  id: number;
  status: "pending" | "approved" | "rejected";
  merged_name: string;
  merged_birth_year: number | null;
  merged_death_year: number | null;
  created_at: string;
  branch_a: MergeBranch;
  branch_b: MergeBranch;
  /** Всего персон в общем древе (без двойного счёта якоря). */
  total: number;
}

/** Собрать карточки объединённых древ с указанным статусом. */
async function listTreeMerges(
  status: "pending" | "approved" | "rejected",
  teipIds: number[] | null = null,
): Promise<TreeMerge[]> {
  const rows = await query<Record<string, unknown>>(
    `
    SELECT tm.id, tm.status, tm.created_at,
           tm.merged_name, tm.merged_birth_year, tm.merged_death_year,
           pa.id AS a_id, pa.full_name AS a_name,
           pa.created_by AS a_owner_id, ua.display_name AS a_owner_name,
           ta.name AS a_teip,
           pb.id AS b_id, pb.full_name AS b_name,
           pb.created_by AS b_owner_id, ub.display_name AS b_owner_name,
           tb.name AS b_teip
    FROM tree_merges tm
    JOIN persons pa ON pa.id = tm.anchor_a_id
    JOIN persons pb ON pb.id = tm.anchor_b_id
    LEFT JOIN users ua ON ua.id = pa.created_by
    LEFT JOIN users ub ON ub.id = pb.created_by
    LEFT JOIN teips ta ON ta.id = pa.teip_id
    LEFT JOIN teips tb ON tb.id = pb.teip_id
    WHERE tm.status = $1
      AND ($2::bigint[] IS NULL
           OR pa.teip_id = ANY($2) OR pb.teip_id = ANY($2))
    ORDER BY tm.created_at DESC, tm.id DESC
    LIMIT 200
    `,
    [status, teipIds],
  );

  // Размер каждой ветки (предок + потомки) одним обходом на якорь.
  const result: TreeMerge[] = [];
  for (const r of rows) {
    const aId = Number(r.a_id);
    const bId = Number(r.b_id);
    const [sizeA, sizeB] = await Promise.all([
      branchSize(aId),
      branchSize(bId),
    ]);
    result.push({
      id: Number(r.id),
      status: r.status as "pending" | "approved" | "rejected",
      merged_name: String(r.merged_name ?? r.a_name),
      merged_birth_year:
        r.merged_birth_year == null ? null : Number(r.merged_birth_year),
      merged_death_year:
        r.merged_death_year == null ? null : Number(r.merged_death_year),
      created_at: String(r.created_at),
      branch_a: {
        anchor_id: aId,
        anchor_name: String(r.a_name),
        owner_id: r.a_owner_id == null ? null : Number(r.a_owner_id),
        owner_name: (r.a_owner_name as string) ?? null,
        teip_name: (r.a_teip as string) ?? null,
        size: sizeA,
      },
      branch_b: {
        anchor_id: bId,
        anchor_name: String(r.b_name),
        owner_id: r.b_owner_id == null ? null : Number(r.b_owner_id),
        owner_name: (r.b_owner_name as string) ?? null,
        teip_name: (r.b_teip as string) ?? null,
        size: sizeB,
      },
      total: sizeA + sizeB - 1, // общий предок считаем один раз
    });
  }
  return result;
}

/** Число персон в ветке (предок + все потомки), с защитой от циклов. */
async function branchSize(anchorId: number): Promise<number> {
  const rows = await query<{ n: string }>(
    `
    WITH RECURSIVE d AS (
      SELECT id, ARRAY[id] AS path FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id, d.path || p.id FROM persons p
      JOIN d ON p.father_id = d.id OR p.mother_id = d.id
      WHERE NOT p.id = ANY(d.path)
    )
    SELECT COUNT(*)::text AS n FROM d
    `,
    [anchorId],
  );
  return rows.length ? Number(rows[0].n) : 0;
}

/** Очередь объединённых древ на повторной модерации. */
export function listPendingMerges(
  teipIds: number[] | null = null,
): Promise<TreeMerge[]> {
  return listTreeMerges("pending", teipIds);
}

/** Публичный каталог одобренных объединённых древ. */
export function listApprovedMerges(): Promise<TreeMerge[]> {
  return listTreeMerges("approved");
}

/** Одобрить объединённое древо — оно становится публичным. */
export async function approveMerge(
  mergeId: number,
  adminId: number,
): Promise<{ approved: boolean }> {
  const rows = await query<{ id: number }>(
    `UPDATE tree_merges
     SET status = 'approved', approved_by = $2, resolved_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [mergeId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Объединённое древо не найдено");
  return { approved: true };
}

/** Отклонить объединённое древо — исходные древа остаются раздельными. */
export async function rejectMerge(
  mergeId: number,
  adminId: number,
): Promise<{ rejected: boolean }> {
  const rows = await query<{ id: number }>(
    `UPDATE tree_merges
     SET status = 'rejected', approved_by = $2, resolved_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [mergeId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Объединённое древо не найдено");
  return { rejected: true };
}

/** Отклонить предложение — пара больше не всплывёт. */
export async function dismissMergeSuggestion(
  suggestionId: number,
  adminId: number,
): Promise<{ dismissed: boolean }> {
  const rows = await query<{ id: number }>(
    `UPDATE merge_suggestions
     SET status = 'dismissed', resolved_by = $2, resolved_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [suggestionId, adminId],
  );
  if (rows.length === 0) throw new ApiError(404, "Предложение не найдено");
  return { dismissed: true };
}
