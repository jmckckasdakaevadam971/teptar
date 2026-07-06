import { query } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { UserRole } from "../../middleware/auth.js";
import {
  findSimilarApproved,
  FATHER_MIN_SIMILARITY,
} from "../persons/persons.service.js";

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
  /** Имена жён (жён может быть несколько); хранятся строками при муже. */
  spouse_names?: string[] | null;
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
             p.father_id, p.mother_id, p.spouse_names, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $1${vis.sql}
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, p.spouse_names, a.depth + 1, a.path || p.id
      FROM persons p
      JOIN ancestors a ON p.id = a.father_id OR p.id = a.mother_id
      WHERE a.depth < $2 AND NOT p.id = ANY(a.path)${vis.sql}
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, spouse_names, depth
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
             p.father_id, p.mother_id, p.spouse_names, 0 AS depth, ARRAY[p.id] AS path
      FROM persons p WHERE p.id = $1${vis.sql}
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, p.spouse_names, d.depth + 1, d.path || p.id
      FROM persons p
      JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
      WHERE d.depth < $2 AND NOT p.id = ANY(d.path)${vis.sql}
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, spouse_names, depth
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
 * Объединённое древо (модель «стекло»): собирается на лету из ПОЛНЫХ древ
 * обоих владельцев, связанных общим предком (запись tree_merges). Исходные
 * древа не меняются — якорь B «приравнивается» к якорю A. Включаются предки
 * и боковые ветви обеих сторон: получается одно большое общее древо,
 * а не только потомки точки соединения.
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
    owner_a: number | null;
    owner_b: number | null;
  }>(
    `SELECT tm.anchor_a_id, tm.anchor_b_id, tm.merged_name,
            tm.merged_birth_year, tm.merged_death_year, tm.status,
            pa.created_by AS owner_a, pb.created_by AS owner_b
     FROM tree_merges tm
     JOIN persons pa ON pa.id = tm.anchor_a_id
     JOIN persons pb ON pb.id = tm.anchor_b_id
     WHERE tm.id = $1`,
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

  // Полное древо каждой стороны: все публичные персоны владельца
  // (модератору — включая ожидающие проверки). Если автора нет (наследие),
  // берём хотя бы ветку потомков от якоря.
  const statuses = isAdmin ? ["approved", "pending"] : ["approved"];
  const sideNodes = async (
    ownerId: number | null,
    anchorId: number,
  ): Promise<TreeNode[]> => {
    if (ownerId == null) return getDescendants(anchorId, 40, viewer);
    return query<TreeNode>(
      `SELECT id, full_name, gender, birth_year, death_year,
              father_id, mother_id, spouse_names, 0 AS depth
       FROM persons
       WHERE created_by = $1 AND visibility = 'public' AND status = ANY($2)`,
      [ownerId, statuses],
    );
  };
  const [sideA, sideB] = await Promise.all([
    sideNodes(m.owner_a == null ? null : Number(m.owner_a), anchorA),
    sideNodes(m.owner_b == null ? null : Number(m.owner_b), anchorB),
  ]);

  // node-pg отдаёт BIGINT строками — приводим к числам, иначе сравнение
  // с якорями (числами) не сработает и ветки не сольются.
  const num = (v: number | null): number | null =>
    v == null ? null : Number(v);
  const alias = (personId: number | null): number | null =>
    Number(personId) === anchorB ? anchorA : num(personId);

  const byId = new Map<number, TreeNode>();
  // Родители якоря: отец из древа A, а если там не указан — из древа B
  // (противоречие «два разных отца» блокируется ещё до объединения).
  let anchorFatherB: number | null = null;
  let anchorMotherB: number | null = null;
  for (const n of [...sideA, ...sideB]) {
    const id = alias(n.id)!;
    if (Number(n.id) === anchorB) {
      anchorFatherB = num(n.father_id);
      anchorMotherB = num(n.mother_id);
    }
    if (byId.has(id)) continue; // якорь встречается в обеих сторонах — берём A
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
    if (anchor.father_id == null && anchorFatherB != null)
      anchor.father_id = alias(anchorFatherB);
    if (anchor.mother_id == null && anchorMotherB != null)
      anchor.mother_id = alias(anchorMotherB);
  }

  // Ссылки на родителей вне собранного набора обнуляем: такие узлы —
  // корни своих ветвей (лес прекрасно раскладывается схемой).
  for (const n of byId.values()) {
    if (n.father_id != null && !byId.has(n.father_id)) n.father_id = null;
    if (n.mother_id != null && !byId.has(n.mother_id)) n.mother_id = null;
  }

  // Пересчёт глубины от корней (для аккуратной раскладки схемы).
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
    village_id: number | null;
    father_id: number | null;
  }>(
    `SELECT id, full_name, birth_year, teip_id, village_id, father_id
     FROM persons WHERE created_by = $1`,
    [userId],
  );

  // Имена своих персон — для сверки отцов кандидатов с моим отцом.
  const nameById = new Map<number, string>(
    mine.map((p) => [p.id, p.full_name]),
  );

  const byOwner = new Map<number, RelatedTree>();
  // Оценка лучшего совпадения владельца: имя + бонусы за отца/год/село.
  const bestScore = new Map<number, number>();

  for (const me of mine) {
    if (!me.teip_id) continue;
    const matches = await findSimilarApproved({
      id: me.id,
      full_name: me.full_name,
      birth_year: me.birth_year,
      teip_id: me.teip_id,
      created_by: userId,
      father_name: me.father_id ? (nameById.get(me.father_id) ?? null) : null,
      village_id: me.village_id,
    });
    for (const m of matches) {
      if (m.created_by === null || m.created_by === userId) continue;

      // Отцы известны у обеих сторон, но не похожи → это разные люди.
      if (
        m.father_similarity !== null &&
        m.father_similarity < FATHER_MIN_SIMILARITY
      ) {
        continue;
      }

      const confirmations =
        (m.father_similarity !== null &&
        m.father_similarity >= FATHER_MIN_SIMILARITY
          ? 1
          : 0) +
        (me.birth_year !== null && m.birth_year !== null ? 1 : 0) +
        (m.village_match === true ? 1 : 0);
      const score = m.similarity + confirmations * 0.1;

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
        bestScore.set(m.created_by, score);
      } else {
        existing.match_count += 1;
        if (score > (bestScore.get(m.created_by) ?? 0)) {
          existing.best = match;
          existing.link_person_id = m.id;
          bestScore.set(m.created_by, score);
        }
      }
    }
  }

  return [...byOwner.values()].sort(
    (a, b) =>
      (bestScore.get(b.owner_id) ?? 0) - (bestScore.get(a.owner_id) ?? 0),
  );
}
