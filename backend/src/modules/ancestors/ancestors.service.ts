import { query } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { UserRole } from "../../middleware/auth.js";
import { findSimilarApproved } from "../persons/persons.service.js";

/** Кто запрашивает дерево — для контроля видимости. */
export interface Viewer {
  userId: number | null;
  role: UserRole | null;
}

const ANON: Viewer = { userId: null, role: null };

/**
 * SQL-фрагмент видимости для алиаса персоны.
 * Публике — только общая база; владельцу — плюс своё; админам — всё.
 * userId (если нужен) передаётся параметром $3.
 */
function visClause(
  viewer: Viewer,
  alias: string,
): { sql: string; param: number | null } {
  if (viewer.role === "teip_admin" || viewer.role === "super_admin") {
    return { sql: "", param: null };
  }
  if (viewer.userId) {
    return {
      sql: ` AND (${alias}.visibility = 'public' AND ${alias}.status = 'approved' OR ${alias}.created_by = $3)`,
      param: viewer.userId,
    };
  }
  return {
    sql: ` AND (${alias}.visibility = 'public' AND ${alias}.status = 'approved')`,
    param: null,
  };
}

export interface TreeNode {
  id: number;
  full_name: string;
  gender: "m" | "f";
  birth_year: number | null;
  death_year: number | null;
  father_id: number | null;
  mother_id: number | null;
  depth: number;
}

export interface CommonAncestorResult {
  ancestor: { id: number; full_name: string } | null;
  depth_from_a: number | null;
  depth_from_b: number | null;
  /** Текстовое описание степени родства. */
  relation: string;
}

/**
 * Предки человека вверх по линии (до maxDepth поколений).
 * Защита от циклов через массив посещённых id.
 */
export async function getAncestors(
  id: number,
  maxDepth = 20,
  viewer: Viewer = ANON,
): Promise<TreeNode[]> {
  const vis = visClause(viewer, "p");
  const args: unknown[] = [id, maxDepth];
  if (vis.param !== null) args.push(vis.param);
  return query<TreeNode>(
    `
    WITH RECURSIVE ancestors AS (
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $1${vis.sql}
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, a.depth + 1, a.path || p.id
      FROM persons p
      JOIN ancestors a ON p.id = a.father_id OR p.id = a.mother_id
      WHERE a.depth < $2 AND NOT p.id = ANY(a.path)${vis.sql}
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, depth
    FROM ancestors
    ORDER BY depth
    `,
    args,
  );
}

/** Потомки человека вниз по линии. */
export async function getDescendants(
  id: number,
  maxDepth = 20,
  viewer: Viewer = ANON,
): Promise<TreeNode[]> {
  const vis = visClause(viewer, "p");
  const args: unknown[] = [id, maxDepth];
  if (vis.param !== null) args.push(vis.param);
  return query<TreeNode>(
    `
    WITH RECURSIVE descendants AS (
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $1${vis.sql}
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, d.depth + 1, d.path || p.id
      FROM persons p
      JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
      WHERE d.depth < $2 AND NOT p.id = ANY(d.path)${vis.sql}
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, depth
    FROM descendants
    ORDER BY depth
    `,
    args,
  );
}

/**
 * Полное объединённое древо: от самого старшего предка данной персоны
 * вниз до всех её потомков (включая ветви, приросшие при объединении древ
 * от других владельцев). Так после слияния видно одно цельное дерево.
 */
export async function getFullTree(
  id: number,
  viewer: Viewer = ANON,
): Promise<TreeNode[]> {
  const up = await getAncestors(id, 40, viewer);
  if (up.length === 0) return [];
  // Самый верхний предок — запись с максимальной глубиной подъёма.
  const root = up.reduce((top, n) => (n.depth > top.depth ? n : top), up[0]);
  return getDescendants(root.id, 40, viewer);
}

/**
 * Объединённое древо (модель «стекло»): собирается на лету из двух веток,
 * связанных общим предком (запись tree_merges). Исходные древа не меняются —
 * якорь B «приравнивается» к якорю A, обе ветки потомков сходятся под ним.
 *
 * Видимость: одобренное (approved) видно всем; на модерации (pending)
 * — только админам (иначе 404, чтобы не раскрывать до проверки).
 */
export async function getMergedTree(
  mergeId: number,
  viewer: Viewer = ANON,
): Promise<TreeNode[]> {
  const rows = await query<{
    anchor_a_id: number;
    anchor_b_id: number;
    merged_name: string | null;
    merged_birth_year: number | null;
    merged_death_year: number | null;
    status: string;
  }>(
    `SELECT anchor_a_id, anchor_b_id, merged_name, merged_birth_year,
            merged_death_year, status
     FROM tree_merges WHERE id = $1`,
    [mergeId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Объединённое древо не найдено");

  const m = rows[0];
  const isAdmin = viewer.role === "teip_admin" || viewer.role === "super_admin";
  if (m.status !== "approved" && !isAdmin) {
    throw new ApiError(404, "Объединённое древо не найдено");
  }

  const anchorA = Number(m.anchor_a_id);
  const anchorB = Number(m.anchor_b_id);

  // Обе ветки вниз от своих якорей. Ветку B «переносим» под якорь A.
  const [downA, downB] = await Promise.all([
    getDescendants(anchorA, 40, viewer),
    getDescendants(anchorB, 40, viewer),
  ]);

  // node-pg отдаёт BIGINT строками — приводим к числам, иначе сравнение
  // с якорями (числами) не сработает и ветки не сольются.
  const num = (v: number | null): number | null =>
    v == null ? null : Number(v);
  const alias = (personId: number | null): number | null =>
    Number(personId) === anchorB ? anchorA : num(personId);

  const byId = new Map<number, TreeNode>();
  for (const n of [...downA, ...downB]) {
    const id = alias(n.id)!;
    if (byId.has(id)) continue; // якорь встречается в обеих ветках — берём первый
    byId.set(id, {
      ...n,
      id,
      birth_year: num(n.birth_year),
      death_year: num(n.death_year),
      father_id: alias(n.father_id),
      mother_id: alias(n.mother_id),
    });
  }

  // Общий предок (якорь A) — «шапка» с полями, выбранными модератором.
  const anchor = byId.get(anchorA);
  if (anchor) {
    if (m.merged_name != null && m.merged_name.trim())
      anchor.full_name = m.merged_name;
    if (m.merged_birth_year != null)
      anchor.birth_year = Number(m.merged_birth_year);
    if (m.merged_death_year != null)
      anchor.death_year = Number(m.merged_death_year);
    anchor.father_id = null;
    anchor.mother_id = null;
    anchor.depth = 0;
  }

  // Пересчёт глубины от общего предка (для аккуратной раскладки схемы).
  const nodes = [...byId.values()];
  const depthOf = (id: number, seen = new Set<number>()): number => {
    const node = byId.get(id);
    if (!node || node.father_id == null || seen.has(id)) return 0;
    seen.add(id);
    return depthOf(node.father_id, seen) + 1;
  };
  for (const n of nodes) n.depth = depthOf(n.id);

  return nodes.sort((a, b) => a.depth - b.depth);
}

/**
 * Ближайший общий предок двух людей + степень родства.
 * См. docs/DATABASE_DESIGN.md §3.3.
 */
export async function findCommonAncestor(
  aId: number,
  bId: number,
  viewer: Viewer = ANON,
): Promise<CommonAncestorResult> {
  if (aId === bId) throw new ApiError(400, "Укажите двух разных людей");

  const vis = visClause(viewer, "p");
  const visPe = visClause(viewer, "pe");
  const args: unknown[] = [aId, bId];
  if (vis.param !== null) args.push(vis.param);

  const rows = await query<{
    ancestor_id: number;
    full_name: string;
    depth_from_a: number;
    depth_from_b: number;
  }>(
    `
    WITH RECURSIVE
    anc_a AS (
      SELECT p.id, p.father_id, p.mother_id, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $1${vis.sql}
      UNION ALL
      SELECT p.id, p.father_id, p.mother_id, a.depth + 1, a.path || p.id
      FROM persons p JOIN anc_a a ON p.id = a.father_id OR p.id = a.mother_id
      WHERE NOT p.id = ANY(a.path)${vis.sql}
    ),
    anc_b AS (
      SELECT p.id, p.father_id, p.mother_id, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $2${vis.sql}
      UNION ALL
      SELECT p.id, p.father_id, p.mother_id, b.depth + 1, b.path || p.id
      FROM persons p JOIN anc_b b ON p.id = b.father_id OR p.id = b.mother_id
      WHERE NOT p.id = ANY(b.path)${vis.sql}
    )
    SELECT a.id AS ancestor_id, pe.full_name,
           a.depth AS depth_from_a, b.depth AS depth_from_b
    FROM anc_a a
    JOIN anc_b b ON a.id = b.id
    JOIN persons pe ON pe.id = a.id${visPe.sql}
    ORDER BY (a.depth + b.depth) ASC
    LIMIT 1
    `,
    args,
  );

  if (rows.length === 0) {
    return {
      ancestor: null,
      depth_from_a: null,
      depth_from_b: null,
      relation: "Общий предок не найден",
    };
  }

  const r = rows[0];
  return {
    ancestor: { id: r.ancestor_id, full_name: r.full_name },
    depth_from_a: r.depth_from_a,
    depth_from_b: r.depth_from_b,
    relation: describeRelation(r.depth_from_a, r.depth_from_b),
  };
}

/** Человеко-читаемое описание степени родства по глубинам до общего предка. */
function describeRelation(a: number, b: number): string {
  if (a === 0 && b === 0) return "Это один человек";
  if (a === 0) return "Прямой потомок (по линии вниз)";
  if (b === 0) return "Прямой предок (по линии вверх)";
  if (a === 1 && b === 1) return "Родные братья/сёстры";
  if (a === 2 && b === 2) return "Двоюродные";
  if (a === 3 && b === 3) return "Троюродные";
  if (a === 4 && b === 4) return "Четвероюродные";
  return `Дальнее родство (предки на ${a} и ${b} поколений)`;
}

// ============================================================================
//  ПРИМЕРНОЕ РОДСТВО С ДРУГИМИ ДРЕВАМИ
//  Древа разных людей не связаны по id, поэтому родство «примерное» —
//  через нечёткое совпадение персон (ядро findSimilarApproved).
// ============================================================================

export interface RelatedTreeMatch {
  my_person: { id: number; full_name: string; birth_year: number | null };
  their_person: { id: number; full_name: string; birth_year: number | null };
  similarity: number;
}

export interface RelatedTree {
  owner_id: number;
  owner_name: string | null;
  teip_name: string | null;
  match_count: number;
  best: RelatedTreeMatch;
  /** Персона в чужом древе, к которой можно перейти. */
  link_person_id: number;
}

/**
 * Найти чужие древа, где встречаются похожие на моих люди.
 * Группируем по владельцу; для каждого — лучшее совпадение и ссылка.
 */
export async function findRelatedTrees(userId: number): Promise<RelatedTree[]> {
  const mine = await query<{
    id: number;
    full_name: string;
    birth_year: number | null;
    teip_id: number | null;
  }>(
    `SELECT id, full_name, birth_year, teip_id
     FROM persons WHERE created_by = $1 AND teip_id IS NOT NULL`,
    [userId],
  );

  const byOwner = new Map<number, RelatedTree>();

  for (const me of mine) {
    const matches = await findSimilarApproved({
      id: me.id,
      full_name: me.full_name,
      birth_year: me.birth_year,
      teip_id: me.teip_id,
      created_by: userId,
    });
    for (const m of matches) {
      if (m.created_by === null || m.created_by === userId) continue;
      const existing = byOwner.get(m.created_by);
      const match: RelatedTreeMatch = {
        my_person: {
          id: me.id,
          full_name: me.full_name,
          birth_year: me.birth_year,
        },
        their_person: {
          id: m.id,
          full_name: m.full_name,
          birth_year: m.birth_year,
        },
        similarity: m.similarity,
      };
      if (!existing) {
        byOwner.set(m.created_by, {
          owner_id: m.created_by,
          owner_name: m.owner_name,
          teip_name: m.teip_name,
          match_count: 1,
          best: match,
          link_person_id: m.id,
        });
      } else {
        existing.match_count += 1;
        if (match.similarity > existing.best.similarity) {
          existing.best = match;
          existing.link_person_id = m.id;
        }
      }
    }
  }

  return [...byOwner.values()].sort(
    (a, b) => b.best.similarity - a.best.similarity,
  );
}
