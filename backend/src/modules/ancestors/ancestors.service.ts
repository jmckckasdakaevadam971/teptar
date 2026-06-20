import { query } from '../../db/pool.js';
import { ApiError } from '../../utils/http.js';

export interface TreeNode {
  id: number;
  full_name: string;
  gender: 'm' | 'f';
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
export async function getAncestors(id: number, maxDepth = 20): Promise<TreeNode[]> {
  return query<TreeNode>(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, full_name, gender, birth_year, death_year,
             father_id, mother_id, 0 AS depth, ARRAY[id] AS path
      FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, a.depth + 1, a.path || p.id
      FROM persons p
      JOIN ancestors a ON p.id = a.father_id OR p.id = a.mother_id
      WHERE a.depth < $2 AND NOT p.id = ANY(a.path)
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, depth
    FROM ancestors
    ORDER BY depth
    `,
    [id, maxDepth],
  );
}

/** Потомки человека вниз по линии. */
export async function getDescendants(id: number, maxDepth = 20): Promise<TreeNode[]> {
  return query<TreeNode>(
    `
    WITH RECURSIVE descendants AS (
      SELECT id, full_name, gender, birth_year, death_year,
             father_id, mother_id, 0 AS depth, ARRAY[id] AS path
      FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id, p.full_name, p.gender, p.birth_year, p.death_year,
             p.father_id, p.mother_id, d.depth + 1, d.path || p.id
      FROM persons p
      JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
      WHERE d.depth < $2 AND NOT p.id = ANY(d.path)
    )
    SELECT id, full_name, gender, birth_year, death_year,
           father_id, mother_id, depth
    FROM descendants
    ORDER BY depth
    `,
    [id, maxDepth],
  );
}

/**
 * Ближайший общий предок двух людей + степень родства.
 * См. docs/DATABASE_DESIGN.md §3.3.
 */
export async function findCommonAncestor(
  aId: number,
  bId: number,
): Promise<CommonAncestorResult> {
  if (aId === bId) throw new ApiError(400, 'Укажите двух разных людей');

  const rows = await query<{
    ancestor_id: number;
    full_name: string;
    depth_from_a: number;
    depth_from_b: number;
  }>(
    `
    WITH RECURSIVE
    anc_a AS (
      SELECT id, father_id, mother_id, 0 AS depth, ARRAY[id] AS path
      FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id, p.father_id, p.mother_id, a.depth + 1, a.path || p.id
      FROM persons p JOIN anc_a a ON p.id = a.father_id OR p.id = a.mother_id
      WHERE NOT p.id = ANY(a.path)
    ),
    anc_b AS (
      SELECT id, father_id, mother_id, 0 AS depth, ARRAY[id] AS path
      FROM persons WHERE id = $2
      UNION ALL
      SELECT p.id, p.father_id, p.mother_id, b.depth + 1, b.path || p.id
      FROM persons p JOIN anc_b b ON p.id = b.father_id OR p.id = b.mother_id
      WHERE NOT p.id = ANY(b.path)
    )
    SELECT a.id AS ancestor_id, pe.full_name,
           a.depth AS depth_from_a, b.depth AS depth_from_b
    FROM anc_a a
    JOIN anc_b b ON a.id = b.id
    JOIN persons pe ON pe.id = a.id
    ORDER BY (a.depth + b.depth) ASC
    LIMIT 1
    `,
    [aId, bId],
  );

  if (rows.length === 0) {
    return { ancestor: null, depth_from_a: null, depth_from_b: null, relation: 'Общий предок не найден' };
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
  if (a === 0 && b === 0) return 'Это один человек';
  if (a === 0) return 'Прямой потомок (по линии вниз)';
  if (b === 0) return 'Прямой предок (по линии вверх)';
  if (a === 1 && b === 1) return 'Родные братья/сёстры';
  if (a === 2 && b === 2) return 'Двоюродные';
  if (a === 3 && b === 3) return 'Троюродные';
  if (a === 4 && b === 4) return 'Четвероюродные';
  return `Дальнее родство (предки на ${a} и ${b} поколений)`;
}
