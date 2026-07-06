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

// ============================================================================
//  ЧЕРНОВИК «МОЕГО ДРЕВА»
//  JSON редактора хранится на сервере как есть, чтобы древо было доступно
//  с любого устройства (localStorage остаётся офлайн-кэшем).
// ============================================================================

export interface TreeDraft {
  data: unknown[] | null;
  updated_at: string | null;
}

/** Черновик древа пользователя (null — ещё не сохраняли). */
export async function getTreeDraft(userId: number): Promise<TreeDraft> {
  const rows = await query<{ data: unknown[]; updated_at: string }>(
    "SELECT data, updated_at FROM tree_drafts WHERE user_id = $1",
    [userId],
  );
  if (rows.length === 0) return { data: null, updated_at: null };
  return { data: rows[0].data, updated_at: rows[0].updated_at };
}

/** Сохранить (upsert) черновик древа пользователя. */
export async function saveTreeDraft(
  userId: number,
  data: unknown[],
): Promise<{ updated_at: string }> {
  const rows = await query<{ updated_at: string }>(
    `INSERT INTO tree_drafts (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [userId, JSON.stringify(data)],
  );
  return { updated_at: rows[0].updated_at };
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
  /**
   * Опубликованная версия этого древа участвует в объединении. Одобрение
   * новой версии перепривяжет объединение и отправит его на повторную
   * проверку — модератор должен об этом знать заранее.
   */
  merge_participation?: {
    other_owner_name: string | null;
    status: "pending" | "approved";
  } | null;
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

  // Участие опубликованной версии в объединениях: одобрение новой версии
  // отправит объединение на повторную проверку — предупреждаем модератора.
  const mergeRows = await query<{
    a_owner: number | null;
    b_owner: number | null;
    a_owner_name: string | null;
    b_owner_name: string | null;
    status: "pending" | "approved";
  }>(
    `SELECT tm.status,
            pa.created_by AS a_owner, pb.created_by AS b_owner,
            ua.display_name AS a_owner_name, ub.display_name AS b_owner_name
     FROM tree_merges tm
     JOIN persons pa ON pa.id = tm.anchor_a_id
     JOIN persons pb ON pb.id = tm.anchor_b_id
     LEFT JOIN users ua ON ua.id = pa.created_by
     LEFT JOIN users ub ON ub.id = pb.created_by
     WHERE tm.status IN ('pending', 'approved')
       AND (pa.created_by = ANY($1) OR pb.created_by = ANY($1))`,
    [trees.map((t) => t.owner_id)],
  );
  for (const tree of trees) {
    tree.merge_participation = null;
    for (const m of mergeRows) {
      const isA = m.a_owner != null && Number(m.a_owner) === tree.owner_id;
      const isB = m.b_owner != null && Number(m.b_owner) === tree.owner_id;
      if (!isA && !isB) continue;
      // approved важнее pending — показываем самое сильное участие.
      if (
        !tree.merge_participation ||
        (m.status === "approved" &&
          tree.merge_participation.status === "pending")
      ) {
        tree.merge_participation = {
          other_owner_name: isA ? m.b_owner_name : m.a_owner_name,
          status: m.status,
        };
      }
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
 *
 * Объединения (tree_merges), чьи якоря жили в старой версии, при удалении
 * снесло бы каскадом. Поэтому запоминаем их заранее, а после одобрения
 * перепривязываем к тому же человеку в новой версии (точное имя + год,
 * иначе pg_trgm ≥ 0.9) и отправляем на ПОВТОРНУЮ модерацию (pending).
 * Если человека в новой версии нет — фиксируем merge_lost в журнале.
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

    // Объединения, держащиеся на персонах этого владельца, — до удаления.
    const merges = await client.query<Record<string, unknown>>(
      `SELECT tm.id, tm.anchor_a_id, tm.anchor_b_id, tm.status,
              tm.merged_name, tm.merged_birth_year, tm.merged_death_year,
              tm.merged_note,
              pa.created_by AS a_owner, pb.created_by AS b_owner,
              pa.full_name AS a_name, pa.birth_year AS a_birth,
              pb.full_name AS b_name, pb.birth_year AS b_birth
       FROM tree_merges tm
       JOIN persons pa ON pa.id = tm.anchor_a_id
       JOIN persons pb ON pb.id = tm.anchor_b_id
       WHERE tm.status IN ('pending', 'approved')
         AND (pa.created_by = $1 OR pb.created_by = $1)`,
      [ownerId],
    );

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

    // Перепривязка объединений к новой версии древа.
    for (const m of merges.rows) {
      // Уцелела ли связь? (якорь владельца мог быть pending — тогда не удалялся)
      const alive = await client.query(
        `SELECT 1 FROM tree_merges WHERE id = $1`,
        [Number(m.id)],
      );
      if (alive.rowCount) continue;

      const aIsOwn = Number(m.a_owner) === ownerId;
      const bIsOwn = Number(m.b_owner) === ownerId;
      const ownName = String(aIsOwn ? m.a_name : m.b_name);
      const ownBirth =
        (aIsOwn ? m.a_birth : m.b_birth) == null
          ? null
          : Number(aIsOwn ? m.a_birth : m.b_birth);
      const otherAnchor = aIsOwn
        ? Number(m.anchor_b_id)
        : Number(m.anchor_a_id);

      // Обе стороны в одном древе (наследие) — восстанавливать нечего.
      const lost = async (reason: string) => {
        await client.query(
          `INSERT INTO change_log (person_id, user_id, action, diff)
           VALUES (NULL, $1, 'merge_lost', $2)`,
          [
            adminId,
            JSON.stringify({
              owner: ownerId,
              merge_id: Number(m.id),
              anchor_name: ownName,
              was_status: String(m.status),
              reason,
            }),
          ],
        );
      };
      if (aIsOwn && bIsOwn) {
        await lost("обе стороны объединения были в этом древе");
        continue;
      }

      // Тот же человек в новой версии: точное имя (+год), иначе trgm ≥ 0.9.
      const found = await client.query<{ id: number }>(
        `SELECT id FROM persons
         WHERE created_by = $1 AND status = 'approved' AND visibility = 'public'
           AND (
             (lower(full_name) = lower($2)
              AND ($3::int IS NULL OR birth_year IS NULL OR birth_year = $3))
             OR (similarity(full_name, $2) >= 0.9
                 AND ($3::int IS NULL OR birth_year IS NULL
                      OR abs(birth_year - $3) <= 2))
           )
         ORDER BY (lower(full_name) = lower($2)) DESC,
                  similarity(full_name, $2) DESC
         LIMIT 1`,
        [ownerId, ownName, ownBirth],
      );
      if (!found.rowCount) {
        await lost("в новой версии древа не нашёлся общий предок");
        continue;
      }

      const newAnchor = Number(found.rows[0].id);
      if (newAnchor === otherAnchor) continue;
      const lo = Math.min(newAnchor, otherAnchor);
      const hi = Math.max(newAnchor, otherAnchor);
      await client.query(
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
               created_at = now()`,
        [
          lo,
          hi,
          m.merged_name ?? null,
          m.merged_birth_year == null ? null : Number(m.merged_birth_year),
          m.merged_death_year == null ? null : Number(m.merged_death_year),
          m.merged_note ?? null,
          adminId,
        ],
      );
      await client.query(
        `INSERT INTO change_log (person_id, user_id, action, diff)
         VALUES ($1, $2, 'merge_rebound', $3)`,
        [
          newAnchor,
          adminId,
          JSON.stringify({
            owner: ownerId,
            old_merge_id: Number(m.id),
            was_status: String(m.status),
            anchor_a: lo,
            anchor_b: hi,
          }),
        ],
      );
    }

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
  /** Совпало ли село: true/false — оба села указаны; null — сравнить нельзя. */
  village_match: boolean | null;
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
  /** Село искомой персоны — для сверки сёл (опционально). */
  village_id?: number | null;
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
           END AS father_similarity,
           CASE
             WHEN p.village_id IS NOT NULL AND $8::bigint IS NOT NULL
             THEN p.village_id = $8::bigint
             ELSE NULL
           END AS village_match
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
      seed.village_id ?? null,
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
 * Логика: сходство имени — базовый сигнал; отец, год рождения и село —
 * подтверждения.
 *  • есть хотя бы одно подтверждение (отец совпал, ИЛИ оба года указаны
 *    и близки, ИЛИ оба села указаны и совпали) → достаточно ANCHOR_MIN_SIMILARITY;
 *  • подтверждений нет → имя должно совпадать почти точно: ANCHOR_STRICT_SIMILARITY;
 *  • отцы известны у обеих сторон, но их имена НЕ похожи
 *    → кандидат отбрасывается, какое бы похожее имя ни было (это разные люди).
 *  • НЕсовпадение сёл кандидата не отбрасывает (семьи переезжали) —
 *    село работает только как положительный сигнал.
 */
const ANCHOR_MIN_SIMILARITY = 0.62;
const ANCHOR_STRICT_SIMILARITY = 0.82;
export const FATHER_MIN_SIMILARITY = 0.45;

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
        village_id: p.village_id,
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

      // Село: подтверждение только при совпадении; несовпадение не отсекает.
      const villageOk = c.village_match === true;

      const confirmations =
        (fatherOk ? 1 : 0) + (yearOk ? 1 : 0) + (villageOk ? 1 : 0);
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
  /** Публичных персон в древе владельца — модератору видно, какая ветвь
   *  присоединяется к большему древу. */
  tree_size: number;
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

  // Размеры древ обеих сторон: ветвь меньшего присоединится к большему.
  const ownerIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.a_owner_id, r.b_owner_id])
        .filter((id) => id != null)
        .map(Number),
    ),
  );
  const sizeByOwner = new Map<number, number>();
  if (ownerIds.length) {
    const sizes = await query<{ created_by: number; n: number }>(
      `SELECT created_by, COUNT(*)::int AS n FROM persons
       WHERE created_by = ANY($1) AND visibility = 'public'
         AND status IN ('approved', 'pending')
       GROUP BY created_by`,
      [ownerIds],
    );
    for (const s of sizes) sizeByOwner.set(Number(s.created_by), Number(s.n));
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
      tree_size:
        r.a_owner_id == null
          ? 0
          : (sizeByOwner.get(Number(r.a_owner_id)) ?? 0),
    },
    owner_b: {
      owner_id: r.b_owner_id == null ? null : Number(r.b_owner_id),
      owner_name: (r.b_owner_name as string) ?? null,
      tree_size:
        r.b_owner_id == null
          ? 0
          : (sizeByOwner.get(Number(r.b_owner_id)) ?? 0),
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

  // Жёсткая сверка перед объединением: противоречия (два отца, разный пол,
  // разные тейпы и т. п.) блокируют слияние — сначала исправьте данные.
  const check = await checkMergePair(a, b);
  if (!check.can_merge) {
    const reasons = check.items
      .filter((i) => i.level === "block")
      .map((i) => i.message)
      .join("; ");
    throw new ApiError(400, `Объединение заблокировано: ${reasons}`);
  }

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
  /** Сколько персон в полном древе этой стороны (всё древо владельца). */
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
  /** Всего персон в ЦЕЛОМ объединённом древе (общие люди — один раз). */
  total: number;
  /** Имя первопредка (корня) всего объединённого древа — название карточки. */
  root_name: string;
  root_birth_year: number | null;
  root_death_year: number | null;
  /** Сколько новых людей добавила присоединённая ветвь (без общих). */
  added_count: number;
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

  // Карточка считается по ЦЕЛОМУ объединённому древу, а не по ветке от
  // точки соединения: размер сторон — полные древа владельцев, итог и
  // первопредок — тем же алгоритмом, каким собирается само древо.
  // Динамический импорт: ancestors.service сам импортирует наши формулы,
  // статическая ссылка замкнула бы модули в кольцо.
  const { getMergedTreeStats } = await import(
    "../ancestors/ancestors.service.js"
  );
  const sideStatuses =
    status === "approved" ? ["approved"] : ["approved", "pending"];
  const statsViewer: Viewer = {
    userId: null,
    role: status === "approved" ? null : "super_admin",
  };

  const result: TreeMerge[] = [];
  for (const r of rows) {
    const aId = Number(r.a_id);
    const bId = Number(r.b_id);
    const [sizeA, sizeB] = await Promise.all([
      ownerTreeSize(
        r.a_owner_id == null ? null : Number(r.a_owner_id),
        aId,
        sideStatuses,
      ),
      ownerTreeSize(
        r.b_owner_id == null ? null : Number(r.b_owner_id),
        bId,
        sideStatuses,
      ),
    ]);

    // Запасные значения на случай битых данных — карточка не валит каталог.
    let total = Math.max(sizeA, sizeB);
    let addedCount = 0;
    let rootName = String(r.merged_name ?? r.a_name);
    let rootBirth: number | null = null;
    let rootDeath: number | null = null;
    try {
      const s = await getMergedTreeStats(Number(r.id), statsViewer);
      total = s.total;
      addedCount = s.added_count;
      if (s.root_name != null && s.root_name.trim()) {
        rootName = s.root_name;
        rootBirth = s.root_birth_year;
        rootDeath = s.root_death_year;
      }
    } catch {
      // сводка недоступна — оставляем запасные значения
    }

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
      total,
      root_name: rootName,
      root_birth_year: rootBirth,
      root_death_year: rootDeath,
      added_count: addedCount,
    });
  }
  return result;
}

/**
 * Полный размер древа стороны: все публичные персоны владельца (модератору
 * — включая ожидающих проверки). Для наследия без владельца — ветка потомков
 * от якоря.
 */
async function ownerTreeSize(
  ownerId: number | null,
  anchorId: number,
  statuses: string[],
): Promise<number> {
  if (ownerId == null) return branchSize(anchorId);
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM persons
     WHERE created_by = $1 AND visibility = 'public' AND status = ANY($2)`,
    [ownerId, statuses],
  );
  return rows.length ? Number(rows[0].n) : 0;
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

// ============================================================================
//  ПРОВЕРКА ПЕРЕД ОБЪЕДИНЕНИЕМ, РУЧНОЕ ОБЪЕДИНЕНИЕ И ОТМЕНА
//  Модератор сам выбирает точку соединения; система сверяет данные и жёстко
//  блокирует логические ошибки (два разных отца, разный пол и т. п.).
// ============================================================================

/** Карточка одной стороны для сверки перед объединением. */
export interface MergeCheckPerson {
  id: number;
  full_name: string;
  gender: "m" | "f" | null;
  birth_year: number | null;
  death_year: number | null;
  teip_name: string | null;
  village_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  /** Размер древа владельца (public, approved+pending). */
  tree_size: number;
  children: { id: number; full_name: string; birth_year: number | null }[];
}

/** Один пункт чек-листа сверки. */
export interface MergeCheckItem {
  level: "ok" | "warn" | "block";
  code: string;
  message: string;
}

/** Результат сверки пары персон перед объединением. */
export interface MergeCheck {
  a: MergeCheckPerson;
  b: MergeCheckPerson;
  items: MergeCheckItem[];
  /** false — есть блокирующие противоречия, объединять нельзя. */
  can_merge: boolean;
}

/** Порог «имена заметно похожи» для пунктов чек-листа. */
export const CHECK_NAME_OK = 0.62;

/**
 * SQL-выражение комбинированного сходства имён (0..1) для выражений a и b.
 * pg_trgm несправедливо занижает короткие кавказские имена с вариантами
 * написания («Ахмад»/«Ахьмад» = 0.44), поэтому берём максимум из:
 * триграмм по исходным строкам, триграмм по нормализованным (без «ь»/«ъ»,
 * ё→е) и запасной оценки по Левенштейну (1 правка — почти одно имя).
 */
export function nameSimSql(a: string, b: string): string {
  const norm = (x: string) =>
    `replace(replace(replace(lower(${x}), 'ь', ''), 'ъ', ''), 'ё', 'е')`;
  const na = norm(a);
  const nb = norm(b);
  return `GREATEST(
    similarity(${a}, ${b}),
    similarity(${na}, ${nb}),
    CASE
      WHEN length(${a}) > 100 OR length(${b}) > 100 THEN 0
      WHEN levenshtein(${na}, ${nb}) <= 1 THEN 0.9
      WHEN levenshtein(${na}, ${nb}) <= 2
           AND LEAST(length(${a}), length(${b})) >= 7 THEN 0.7
      ELSE 0
    END
  )`;
}

/**
 * Сверить две персоны как кандидатов в общую точку соединения древ.
 * Возвращает карточки обеих сторон и чек-лист ok/warn/block.
 * Используется и для ручного объединения, и перед применением предложения.
 */
export async function checkMergePair(
  aId: number,
  bId: number,
): Promise<MergeCheck> {
  if (!Number.isFinite(aId) || !Number.isFinite(bId))
    throw new ApiError(400, "Нужны две персоны для сверки");

  const rows = await query<Record<string, unknown>>(
    `SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
            p.teip_id, t.name AS teip_name,
            p.village_id, v.name AS village_name,
            p.father_id, f.full_name AS father_name,
            p.mother_id, m.full_name AS mother_name,
            p.created_by AS owner_id, u.display_name AS owner_name,
            p.status, p.visibility
     FROM persons p
     LEFT JOIN teips t    ON t.id = p.teip_id
     LEFT JOIN villages v ON v.id = p.village_id
     LEFT JOIN persons f  ON f.id = p.father_id
     LEFT JOIN persons m  ON m.id = p.mother_id
     LEFT JOIN users u    ON u.id = p.created_by
     WHERE p.id = ANY($1)`,
    [[aId, bId]],
  );
  const rowA = rows.find((r) => Number(r.id) === aId);
  const rowB = rows.find((r) => Number(r.id) === bId);
  if (!rowA || !rowB) throw new ApiError(404, "Одна из записей не найдена");

  // Дети обеих сторон одним запросом.
  const kids = await query<{
    father_id: number | null;
    mother_id: number | null;
    id: number;
    full_name: string;
    birth_year: number | null;
  }>(
    `SELECT father_id, mother_id, id, full_name, birth_year FROM persons
     WHERE father_id = ANY($1) OR mother_id = ANY($1)
     ORDER BY COALESCE(birth_year, 9999), full_name`,
    [[aId, bId]],
  );
  const childrenOf = (pid: number) =>
    kids
      .filter(
        (k) => Number(k.father_id) === pid || Number(k.mother_id) === pid,
      )
      .map((k) => ({
        id: Number(k.id),
        full_name: k.full_name,
        birth_year: k.birth_year == null ? null : Number(k.birth_year),
      }));

  // Размеры древ владельцев.
  const ownerA = rowA.owner_id == null ? null : Number(rowA.owner_id);
  const ownerB = rowB.owner_id == null ? null : Number(rowB.owner_id);
  const sizeByOwner = new Map<number, number>();
  const ownerIds = [ownerA, ownerB].filter((x): x is number => x != null);
  if (ownerIds.length) {
    const sizes = await query<{ created_by: number; n: number }>(
      `SELECT created_by, COUNT(*)::int AS n FROM persons
       WHERE created_by = ANY($1) AND visibility = 'public'
         AND status IN ('approved', 'pending')
       GROUP BY created_by`,
      [ownerIds],
    );
    for (const s of sizes) sizeByOwner.set(Number(s.created_by), Number(s.n));
  }

  const card = (r: Record<string, unknown>): MergeCheckPerson => ({
    id: Number(r.id),
    full_name: String(r.full_name),
    gender: (r.gender as "m" | "f") ?? null,
    birth_year: r.birth_year == null ? null : Number(r.birth_year),
    death_year: r.death_year == null ? null : Number(r.death_year),
    teip_name: (r.teip_name as string) ?? null,
    village_name: (r.village_name as string) ?? null,
    father_name: (r.father_name as string) ?? null,
    mother_name: (r.mother_name as string) ?? null,
    owner_id: r.owner_id == null ? null : Number(r.owner_id),
    owner_name: (r.owner_name as string) ?? null,
    tree_size:
      r.owner_id == null ? 0 : (sizeByOwner.get(Number(r.owner_id)) ?? 0),
    children: childrenOf(Number(r.id)),
  });
  const a = card(rowA);
  const b = card(rowB);

  // Сходство имён (своих, отцов, матерей) — комбинированная формула,
  // терпимая к вариантам написания («Ахмад»/«Ахьмад», «Хусейн»/«Хусайн»).
  const sims = await query<{
    name_sim: number;
    father_sim: number | null;
    mother_sim: number | null;
  }>(
    `SELECT ${nameSimSql("$1::text", "$2::text")} AS name_sim,
            CASE WHEN $3::text IS NULL OR $4::text IS NULL THEN NULL
                 ELSE ${nameSimSql("$3::text", "$4::text")} END AS father_sim,
            CASE WHEN $5::text IS NULL OR $6::text IS NULL THEN NULL
                 ELSE ${nameSimSql("$5::text", "$6::text")} END AS mother_sim`,
    [
      a.full_name,
      b.full_name,
      a.father_name,
      b.father_name,
      a.mother_name,
      b.mother_name,
    ],
  );
  const nameSim = Number(sims[0].name_sim ?? 0);
  const fatherSim =
    sims[0].father_sim == null ? null : Number(sims[0].father_sim);
  const motherSim =
    sims[0].mother_sim == null ? null : Number(sims[0].mother_sim);

  // Похожие дети с обеих сторон — сильное подтверждение «это один человек».
  const commonKids = await query<{ a_name: string; b_name: string }>(
    `SELECT ka.full_name AS a_name, kb.full_name AS b_name
     FROM persons ka, persons kb
     WHERE (ka.father_id = $1 OR ka.mother_id = $1)
       AND (kb.father_id = $2 OR kb.mother_id = $2)
       AND ${nameSimSql("ka.full_name", "kb.full_name")} >= ${CHECK_NAME_OK}
     ORDER BY ${nameSimSql("ka.full_name", "kb.full_name")} DESC
     LIMIT 5`,
    [aId, bId],
  );

  // Уже существующая связь пары.
  const lo = Math.min(aId, bId);
  const hi = Math.max(aId, bId);
  const existing = await query<{ id: number; status: string }>(
    `SELECT id, status FROM tree_merges
     WHERE anchor_a_id = $1 AND anchor_b_id = $2`,
    [lo, hi],
  );

  const items: MergeCheckItem[] = [];
  const push = (level: MergeCheckItem["level"], code: string, message: string) =>
    items.push({ level, code, message });

  // ── Блокирующие противоречия ─────────────────────────────────────────
  if (aId === bId) push("block", "same_person", "Это одна и та же запись");
  if (
    String(rowA.visibility) !== "public" ||
    String(rowB.visibility) !== "public" ||
    !["approved", "pending"].includes(String(rowA.status)) ||
    !["approved", "pending"].includes(String(rowB.status))
  )
    push(
      "block",
      "not_public",
      "Обе записи должны быть публичными (опубликованы или на модерации)",
    );
  if (ownerA == null || ownerB == null)
    push(
      "block",
      "no_owner",
      "У одной из записей нет автора — объединяются древа разных авторов",
    );
  else if (ownerA === ownerB)
    push(
      "block",
      "same_owner",
      "Обе записи принадлежат одному автору — это одно древо, объединять нечего",
    );
  if (a.gender && b.gender && a.gender !== b.gender)
    push("block", "gender", "Разный пол — это не может быть один человек");
  if (fatherSim != null && fatherSim < FATHER_MIN_SIMILARITY)
    push(
      "block",
      "two_fathers",
      `Указаны разные отцы: «${a.father_name}» и «${b.father_name}» — у человека получилось бы два отца`,
    );
  if (motherSim != null && motherSim < FATHER_MIN_SIMILARITY)
    push(
      "block",
      "two_mothers",
      `Указаны разные матери: «${a.mother_name}» и «${b.mother_name}» — у человека получилось бы две матери`,
    );
  if (a.teip_name && b.teip_name && a.teip_name !== b.teip_name)
    push(
      "block",
      "teip",
      `Разные тейпы: ${a.teip_name} и ${b.teip_name} — один человек не может состоять в двух тейпах`,
    );
  if (
    a.birth_year != null &&
    b.birth_year != null &&
    Math.abs(a.birth_year - b.birth_year) > 10
  )
    push(
      "block",
      "birth_year_far",
      `Годы рождения расходятся на ${Math.abs(a.birth_year - b.birth_year)} лет (${a.birth_year} и ${b.birth_year})`,
    );
  if (existing.length && existing[0].status === "approved")
    push(
      "block",
      "already_merged",
      "Эти древа уже объединены через эту пару — отмените объединение, чтобы изменить",
    );
  else if (existing.length && existing[0].status === "pending")
    push(
      "block",
      "merge_pending",
      "Объединение этой пары уже ждёт проверки в очереди",
    );

  // ── Сверка совпадений (подтверждения и предупреждения) ───────────────
  if (nameSim >= CHECK_NAME_OK)
    push(
      "ok",
      "name",
      `Имена совпадают: «${a.full_name}» ↔ «${b.full_name}» (${Math.round(nameSim * 100)}%)`,
    );
  else if (nameSim >= FATHER_MIN_SIMILARITY)
    push(
      "warn",
      "name",
      `Имена похожи лишь отчасти (${Math.round(nameSim * 100)}%) — убедитесь, что это один человек`,
    );
  else
    push(
      "warn",
      "name",
      `Имена заметно различаются: «${a.full_name}» и «${b.full_name}» — нужны веские основания`,
    );

  if (fatherSim != null && fatherSim >= FATHER_MIN_SIMILARITY)
    push(
      "ok",
      "father",
      `Отцы совпадают: «${a.father_name}» ↔ «${b.father_name}»`,
    );
  else if (fatherSim == null && (a.father_name || b.father_name))
    push(
      "warn",
      "father",
      "Отец указан только в одном древе — сверить некому, проверьте по документам",
    );

  if (motherSim != null && motherSim >= FATHER_MIN_SIMILARITY)
    push(
      "ok",
      "mother",
      `Матери совпадают: «${a.mother_name}» ↔ «${b.mother_name}»`,
    );

  if (a.teip_name && b.teip_name && a.teip_name === b.teip_name)
    push("ok", "teip", `Тейп совпадает: ${a.teip_name}`);
  else if (!a.teip_name || !b.teip_name)
    push("warn", "teip", "Тейп указан не у обеих записей");

  if (a.village_name && b.village_name) {
    if (a.village_name === b.village_name)
      push("ok", "village", `Село совпадает: ${a.village_name}`);
    else
      push(
        "warn",
        "village",
        `Сёла различаются: ${a.village_name} и ${b.village_name} (возможен переезд)`,
      );
  }

  if (a.birth_year != null && b.birth_year != null) {
    const diff = Math.abs(a.birth_year - b.birth_year);
    if (diff <= 2)
      push(
        "ok",
        "birth_year",
        diff === 0
          ? `Год рождения совпадает: ${a.birth_year}`
          : `Годы рождения близки: ${a.birth_year} и ${b.birth_year}`,
      );
    else if (diff <= 10)
      push(
        "warn",
        "birth_year",
        `Годы рождения расходятся на ${diff} лет (${a.birth_year} и ${b.birth_year})`,
      );
  } else {
    push("warn", "birth_year", "Год рождения указан не у обеих записей");
  }

  if (commonKids.length) {
    const pairs = commonKids
      .map((k) =>
        k.a_name === k.b_name ? `«${k.a_name}»` : `«${k.a_name}» ↔ «${k.b_name}»`,
      )
      .join(", ");
    push(
      "ok",
      "children",
      `Совпадают дети: ${pairs} — сильное подтверждение`,
    );
  } else if (a.children.length && b.children.length) {
    push(
      "warn",
      "children",
      "Общих детей не найдено: в двух древах у этого человека разные дети (ветви дополняют друг друга — проверьте, что это не однофамилец)",
    );
  }

  // block выше warn выше ok — чтобы модератор сразу видел препятствия.
  const rank = { block: 0, warn: 1, ok: 2 } as const;
  items.sort((x, y) => rank[x.level] - rank[y.level]);

  return { a, b, items, can_merge: !items.some((i) => i.level === "block") };
}

/**
 * Ручное объединение: модератор сам выбрал точку соединения (двух персон из
 * разных древ). Проверки жёсткие: любые block-противоречия — отказ 400.
 * Пара попадает в tree_merges со статусом pending (повторная модерация),
 * как и при объединении из предложения.
 */
export async function manualMerge(
  aId: number,
  bId: number,
  adminId: number,
  keepId?: number,
  overrides?: MergeOverrides,
): Promise<{ merged: boolean; tree_merge_id: number; check: MergeCheck }> {
  const check = await checkMergePair(aId, bId);
  if (!check.can_merge) {
    const reasons = check.items
      .filter((i) => i.level === "block")
      .map((i) => i.message)
      .join("; ");
    throw new ApiError(400, `Объединение заблокировано: ${reasons}`);
  }

  const keep = keepId === bId ? check.b : check.a;
  const name =
    overrides?.full_name != null && overrides.full_name.trim()
      ? overrides.full_name.trim()
      : keep.full_name;
  const birth =
    overrides?.birth_year !== undefined
      ? overrides.birth_year
      : keep.birth_year;
  const death =
    overrides?.death_year !== undefined
      ? overrides.death_year
      : keep.death_year;
  const note = overrides?.note !== undefined ? overrides.note : null;

  const lo = Math.min(aId, bId);
  const hi = Math.max(aId, bId);

  return withTransaction(async (client) => {
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
      [lo, hi, name, birth, death, note, adminId],
    );

    // Если на эту пару было автоматическое предложение — закрываем его.
    await client.query(
      `UPDATE merge_suggestions
       SET status = 'merged', resolved_by = $3, resolved_at = now()
       WHERE person_a_id = $1 AND person_b_id = $2 AND status = 'pending'`,
      [lo, hi, adminId],
    );

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'merge', $3)`,
      [
        keep.id,
        adminId,
        JSON.stringify({ anchor_a: lo, anchor_b: hi, manual: true }),
      ],
    );

    return {
      merged: true,
      tree_merge_id: Number(ins.rows[0].id),
      check,
    };
  });
}

/**
 * Отменить ОДОБРЕННОЕ объединение: древа снова становятся независимыми.
 * Исходные данные не менялись при объединении, поэтому отмена — это просто
 * снятие связи (статус rejected). Пару можно объединить заново позже.
 */
export async function unmerge(
  mergeId: number,
  adminId: number,
): Promise<{ cancelled: boolean }> {
  const rows = await query<{ anchor_a_id: number; anchor_b_id: number }>(
    `UPDATE tree_merges
     SET status = 'rejected', approved_by = $2, resolved_at = now()
     WHERE id = $1 AND status = 'approved'
     RETURNING anchor_a_id, anchor_b_id`,
    [mergeId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Одобренное объединение не найдено");
  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES (NULL, $1, 'unmerge', $2)`,
    [
      adminId,
      JSON.stringify({
        merge_id: mergeId,
        anchor_a: Number(rows[0].anchor_a_id),
        anchor_b: Number(rows[0].anchor_b_id),
      }),
    ],
  );
  return { cancelled: true };
}

/** Найденная персона для ручного выбора точки соединения. */
export interface MergeSearchHit {
  id: number;
  full_name: string;
  gender: "m" | "f" | null;
  birth_year: number | null;
  death_year: number | null;
  teip_name: string | null;
  village_name: string | null;
  father_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  status: string;
}

/** Поиск персон по имени для ручного объединения (только публичные с автором). */
export async function searchMergeCandidates(
  q: string,
): Promise<MergeSearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await query<Record<string, unknown>>(
    `SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year, p.status,
            t.name AS teip_name, v.name AS village_name,
            f.full_name AS father_name,
            p.created_by AS owner_id, u.display_name AS owner_name,
            GREATEST(similarity(p.full_name, $1),
                     CASE WHEN p.full_name ILIKE '%' || $1 || '%'
                          THEN 0.99 ELSE 0 END) AS sim
     FROM persons p
     LEFT JOIN teips t    ON t.id = p.teip_id
     LEFT JOIN villages v ON v.id = p.village_id
     LEFT JOIN persons f  ON f.id = p.father_id
     LEFT JOIN users u    ON u.id = p.created_by
     WHERE p.visibility = 'public' AND p.status IN ('approved', 'pending')
       AND p.created_by IS NOT NULL
       AND (p.full_name % $1 OR p.full_name ILIKE '%' || $1 || '%')
     ORDER BY sim DESC, COALESCE(p.birth_year, 9999), p.full_name
     LIMIT 20`,
    [term],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    full_name: String(r.full_name),
    gender: (r.gender as "m" | "f") ?? null,
    birth_year: r.birth_year == null ? null : Number(r.birth_year),
    death_year: r.death_year == null ? null : Number(r.death_year),
    teip_name: (r.teip_name as string) ?? null,
    village_name: (r.village_name as string) ?? null,
    father_name: (r.father_name as string) ?? null,
    owner_id: r.owner_id == null ? null : Number(r.owner_id),
    owner_name: (r.owner_name as string) ?? null,
    status: String(r.status),
  }));
}
