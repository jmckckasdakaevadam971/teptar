import { query } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { CreateBranchRequestInput } from "./branch-access.types.js";

/**
 * Запросы доступа к ветви родословной.
 *
 * Пользователь выбирает человека в опубликованном древе и просит у владельца
 * доступ к его ветви (выбранный человек + все его потомки). При одобрении
 * владельцем он может править ТОЛЬКО персон этой ветви — правки складываются
 * в pending_diff и применяются после проверки модератором (updatePerson).
 */

export interface BranchRequestRow {
  id: number;
  requester_id: number;
  owner_id: number;
  branch_root_id: number;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  resolved_at: string | null;
  created_at: string;
}

/** Все id персон ветви: человек + потомки в рамках древа того же владельца. */
export async function getBranchIds(branchRootId: number): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `WITH RECURSIVE branch AS (
       SELECT id, created_by FROM persons WHERE id = $1
       UNION ALL
       SELECT p.id, p.created_by
         FROM persons p
         JOIN branch b ON (p.father_id = b.id OR p.mother_id = b.id)
        WHERE p.created_by IS NOT DISTINCT FROM b.created_by
     )
     SELECT id FROM branch`,
    [branchRootId],
  );
  return rows.map((r) => Number(r.id));
}

/**
 * Корень древа, в которое входит персона: users.root_person_id владельца,
 * а если он не указан — самый верхний предок по цепочке родителей.
 */
export async function getTreeRootId(personId: number): Promise<number> {
  const explicit = await query<{ root: number | null }>(
    `SELECT u.root_person_id AS root
       FROM persons p
       JOIN users u ON u.id = p.created_by
      WHERE p.id = $1`,
    [personId],
  );
  if (explicit[0]?.root != null) return Number(explicit[0].root);

  const rows = await query<{ id: number }>(
    `WITH RECURSIVE up AS (
       SELECT id, father_id, mother_id, 0 AS depth
         FROM persons WHERE id = $1
       UNION ALL
       SELECT p.id, p.father_id, p.mother_id, up.depth + 1
         FROM persons p
         JOIN up ON p.id = up.father_id OR p.id = up.mother_id
        WHERE up.depth < 60
     )
     SELECT id FROM up
      WHERE father_id IS NULL AND mother_id IS NULL
      ORDER BY depth DESC
      LIMIT 1`,
    [personId],
  );
  return rows[0] ? Number(rows[0].id) : personId;
}

/** Есть ли у пользователя одобренный доступ к ветви, содержащей персону. */
export async function hasBranchGrant(
  userId: number,
  personId: number,
): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `WITH RECURSIVE up AS (
       SELECT id, father_id, mother_id, 0 AS depth
         FROM persons WHERE id = $2
       UNION ALL
       SELECT p.id, p.father_id, p.mother_id, up.depth + 1
         FROM persons p
         JOIN up ON p.id = up.father_id OR p.id = up.mother_id
        WHERE up.depth < 60
     )
     SELECT EXISTS (
       SELECT 1 FROM branch_access_requests bar
        WHERE bar.requester_id = $1
          AND bar.status = 'approved'
          AND bar.branch_root_id IN (SELECT id FROM up)
     ) AS ok`,
    [userId, personId],
  );
  return Boolean(rows[0]?.ok);
}

export interface CreatedBranchRequest {
  request: BranchRequestRow;
  owner_email: string | null;
  owner_name: string;
  requester_name: string;
  person_name: string;
  branch_count: number;
}

/** Создать запрос доступа к ветви (письмо владельцу шлёт контроллер). */
export async function createRequest(
  requesterId: number,
  input: CreateBranchRequestInput,
): Promise<CreatedBranchRequest> {
  const persons = await query<{
    id: number;
    full_name: string;
    created_by: number | null;
    visibility: string;
    status: string;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT p.id, p.full_name, p.created_by, p.visibility, p.status,
            u.display_name AS owner_name, u.email AS owner_email
       FROM persons p
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = $1`,
    [input.branch_root_id],
  );
  const person = persons[0];
  if (!person) throw new ApiError(404, "Человек не найден");
  if (person.visibility !== "public" || person.status !== "approved") {
    throw new ApiError(400, "Ветвь можно запросить только в опубликованном древе");
  }
  if (person.created_by == null) {
    throw new ApiError(400, "У этой родословной не указан владелец");
  }
  const ownerId = Number(person.created_by);
  if (ownerId === requesterId) {
    throw new ApiError(400, "Это ваша собственная родословная");
  }

  const dup = await query(
    `SELECT 1 FROM branch_access_requests
      WHERE requester_id = $1 AND branch_root_id = $2
        AND status IN ('pending','approved')`,
    [requesterId, input.branch_root_id],
  );
  if (dup.length > 0) {
    throw new ApiError(
      409,
      "У вас уже есть активный запрос или доступ к этой ветви",
    );
  }

  const rows = await query<BranchRequestRow>(
    `INSERT INTO branch_access_requests (requester_id, owner_id, branch_root_id, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [requesterId, ownerId, input.branch_root_id, input.comment?.trim() || null],
  );

  const requester = await query<{ display_name: string }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [requesterId],
  );
  const branchIds = await getBranchIds(input.branch_root_id);

  return {
    request: rows[0],
    owner_email: person.owner_email,
    owner_name: person.owner_name ?? "владелец родословной",
    requester_name: requester[0]?.display_name ?? "Пользователь",
    person_name: person.full_name,
    branch_count: branchIds.length,
  };
}

export interface IncomingRequest extends BranchRequestRow {
  requester_name: string;
  person_name: string;
  branch_count: number;
  tree_root_id: number;
}

/** Входящие запросы владельцу (ожидающие решения). */
export async function listIncoming(ownerId: number): Promise<IncomingRequest[]> {
  const rows = await query<
    BranchRequestRow & { requester_name: string; person_name: string }
  >(
    `SELECT bar.*, u.display_name AS requester_name, p.full_name AS person_name
       FROM branch_access_requests bar
       JOIN users u  ON u.id = bar.requester_id
       JOIN persons p ON p.id = bar.branch_root_id
      WHERE bar.owner_id = $1 AND bar.status = 'pending'
      ORDER BY bar.created_at DESC`,
    [ownerId],
  );
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      branch_count: (await getBranchIds(r.branch_root_id)).length,
      tree_root_id: await getTreeRootId(r.branch_root_id),
    })),
  );
}

export interface MyRequest extends BranchRequestRow {
  person_name: string;
  tree_root_id: number;
}

/** Мои запросы доступа (все статусы, свежие сверху). */
export async function listMine(requesterId: number): Promise<MyRequest[]> {
  const rows = await query<BranchRequestRow & { person_name: string }>(
    `SELECT bar.*, p.full_name AS person_name
       FROM branch_access_requests bar
       JOIN persons p ON p.id = bar.branch_root_id
      WHERE bar.requester_id = $1
      ORDER BY bar.created_at DESC
      LIMIT 20`,
    [requesterId],
  );
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      tree_root_id: await getTreeRootId(r.branch_root_id),
    })),
  );
}

export interface ResolvedRequest {
  request: BranchRequestRow;
  requester_email: string | null;
  requester_name: string;
  person_name: string;
  tree_root_id: number;
}

/** Решение владельца по запросу: предоставить или отклонить доступ. */
export async function resolveRequest(
  id: number,
  ownerId: number,
  decision: "approved" | "rejected",
): Promise<ResolvedRequest> {
  const rows = await query<BranchRequestRow>(
    `UPDATE branch_access_requests
        SET status = $3, resolved_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'pending'
      RETURNING *`,
    [id, ownerId, decision],
  );
  if (!rows[0]) {
    throw new ApiError(404, "Запрос не найден или уже рассмотрен");
  }
  const req = rows[0];
  const info = await query<{
    requester_email: string | null;
    requester_name: string;
    person_name: string;
  }>(
    `SELECT u.email AS requester_email, u.display_name AS requester_name,
            p.full_name AS person_name
       FROM branch_access_requests bar
       JOIN users u  ON u.id = bar.requester_id
       JOIN persons p ON p.id = bar.branch_root_id
      WHERE bar.id = $1`,
    [id],
  );
  return {
    request: req,
    requester_email: info[0]?.requester_email ?? null,
    requester_name: info[0]?.requester_name ?? "Пользователь",
    person_name: info[0]?.person_name ?? "",
    tree_root_id: await getTreeRootId(req.branch_root_id),
  };
}

export interface MyGrantInfo {
  /** Текущий пользователь — владелец этого древа. */
  is_owner: boolean;
  /** Одобренные ветви пользователя в этом древе. */
  grants: { id: number; branch_root_id: number; branch_root_name: string }[];
  /** Все id персон, которые пользователь может редактировать. */
  editable_ids: number[];
}

/** Права текущего пользователя на древе с корнем rootId. */
export async function getMyGrant(
  userId: number,
  rootId: number,
): Promise<MyGrantInfo> {
  const root = await query<{ created_by: number | null }>(
    `SELECT created_by FROM persons WHERE id = $1`,
    [rootId],
  );
  if (!root[0]) throw new ApiError(404, "Древо не найдено");
  const ownerId = root[0].created_by == null ? null : Number(root[0].created_by);

  if (ownerId != null && ownerId === userId) {
    return { is_owner: true, grants: [], editable_ids: [] };
  }

  if (ownerId == null) return { is_owner: false, grants: [], editable_ids: [] };

  const grants = await query<{
    id: number;
    branch_root_id: number;
    branch_root_name: string;
  }>(
    `SELECT bar.id, bar.branch_root_id, p.full_name AS branch_root_name
       FROM branch_access_requests bar
       JOIN persons p ON p.id = bar.branch_root_id
      WHERE bar.requester_id = $1 AND bar.status = 'approved'
        AND p.created_by = $2`,
    [userId, ownerId],
  );

  const editable = new Set<number>();
  for (const g of grants) {
    for (const pid of await getBranchIds(Number(g.branch_root_id))) {
      editable.add(pid);
    }
  }

  return {
    is_owner: false,
    grants: grants.map((g) => ({
      id: Number(g.id),
      branch_root_id: Number(g.branch_root_id),
      branch_root_name: g.branch_root_name,
    })),
    editable_ids: [...editable],
  };
}
