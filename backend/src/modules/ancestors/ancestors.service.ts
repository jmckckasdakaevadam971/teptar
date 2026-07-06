import { query } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import type { UserRole } from "../../middleware/auth.js";
import {
  findSimilarApproved,
  FATHER_MIN_SIMILARITY,
  CHECK_NAME_OK,
  nameSimSql,
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
  /** Узел пришёл из второго древа при объединении — выделяется в интерфейсе. */
  merge_added?: boolean;
  /** Имя хранителя, из чьей родословной добавлена ветвь. */
  merge_author?: string | null;
  /** Точка соединения — общий человек, через которого слиты древа. */
  merge_anchor?: boolean;
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

/** Сторона объединения: якорь + полный набор узлов этой родословной. */
interface MergeSide {
  anchorId: number;
  /** Имя хранителя стороны — для подписи «Источник: родословная …». */
  ownerName: string | null;
  nodes: TreeNode[];
}

/** Поля точки соединения, выбранные модератором (перекрывают якорь). */
interface MergedHeader {
  merged_name?: string | null;
  merged_birth_year?: number | null;
  merged_death_year?: number | null;
}

/**
 * Полное древо стороны: все публичные персоны владельца в заданных
 * статусах. Если автора нет (наследие), берём хотя бы ветку потомков
 * от якоря.
 */
async function ownerSideNodes(
  ownerId: number | null,
  anchorId: number,
  statuses: string[],
  viewer: Viewer,
): Promise<TreeNode[]> {
  if (ownerId == null) return getDescendants(anchorId, 40, viewer);
  return query<TreeNode>(
    `SELECT id, full_name, gender, birth_year, death_year,
            father_id, mother_id, spouse_names, 0 AS depth
     FROM persons
     WHERE created_by = $1 AND visibility = 'public' AND status = ANY($2)`,
    [ownerId, statuses],
  );
}

/**
 * Объединённое древо (модель «стекло»): собирается на лету из полных древ
 * обоих владельцев, связанных общим человеком (запись tree_merges). Исходные
 * древа не меняются. Это не «две схемы рядом»: от точки соединения система
 * идёт вверх по родителям и вниз по потомкам, приравнивая совпадающих людей,
 * — каждый общий человек остаётся в древе ОДИН раз, а недостающие ветви
 * второго древа прирастают к первому через него. Получается одно
 * непрерывное дерево.
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
    owner_a_name: string | null;
    owner_b_name: string | null;
  }>(
    `SELECT tm.anchor_a_id, tm.anchor_b_id, tm.merged_name,
            tm.merged_birth_year, tm.merged_death_year, tm.status,
            pa.created_by AS owner_a, pb.created_by AS owner_b,
            ua.display_name AS owner_a_name,
            ub.display_name AS owner_b_name
     FROM tree_merges tm
     JOIN persons pa ON pa.id = tm.anchor_a_id
     JOIN persons pb ON pb.id = tm.anchor_b_id
     LEFT JOIN users ua ON ua.id = pa.created_by
     LEFT JOIN users ub ON ub.id = pb.created_by
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

  // Полное древо каждой стороны (модератору — включая ожидающие проверки).
  const statuses = isAdmin ? ["approved", "pending"] : ["approved"];
  const [sideA, sideB] = await Promise.all([
    ownerSideNodes(
      m.owner_a == null ? null : Number(m.owner_a),
      anchorA,
      statuses,
      viewer,
    ),
    ownerSideNodes(
      m.owner_b == null ? null : Number(m.owner_b),
      anchorB,
      statuses,
      viewer,
    ),
  ]);

  return buildMergedTree(
    { anchorId: anchorA, ownerName: m.owner_a_name, nodes: sideA },
    { anchorId: anchorB, ownerName: m.owner_b_name, nodes: sideB },
    m,
  );
}

/**
 * Предпросмотр общего древа по паре якорей — ДО создания записи слияния.
 * Используется модератором при проверке присланного древа: система сама
 * предлагает точку соединения, а этот предпросмотр показывает, каким
 * станет итоговое древо, если решение подтвердить.
 *
 * Каждая сторона берётся в том виде, в каком будет опубликована: для
 * pending-якоря — присланная на проверку версия древа, для approved —
 * уже опубликованная.
 */
export async function getMergedTreePreview(
  anchorAId: number,
  anchorBId: number,
  viewer: Viewer,
): Promise<TreeNode[]> {
  const isAdmin = viewer.role === "teip_admin" || viewer.role === "super_admin";
  if (!isAdmin) throw new ApiError(403, "Доступно только модератору");
  if (anchorAId === anchorBId)
    throw new ApiError(400, "Укажите двух разных людей");

  const rows = await query<{
    id: number;
    created_by: number | null;
    status: string;
    owner_name: string | null;
  }>(
    `SELECT p.id, p.created_by, p.status, u.display_name AS owner_name
     FROM persons p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = ANY($1::bigint[])`,
    [[anchorAId, anchorBId]],
  );
  const pa = rows.find((r) => Number(r.id) === anchorAId);
  const pb = rows.find((r) => Number(r.id) === anchorBId);
  if (!pa || !pb) throw new ApiError(404, "Персона не найдена");

  const statusesOf = (s: string): string[] =>
    s === "pending" ? ["pending"] : ["approved"];
  const [sideA, sideB] = await Promise.all([
    ownerSideNodes(
      pa.created_by == null ? null : Number(pa.created_by),
      anchorAId,
      statusesOf(pa.status),
      viewer,
    ),
    ownerSideNodes(
      pb.created_by == null ? null : Number(pb.created_by),
      anchorBId,
      statusesOf(pb.status),
      viewer,
    ),
  ]);

  return buildMergedTree(
    { anchorId: anchorAId, ownerName: pa.owner_name, nodes: sideA },
    { anchorId: anchorBId, ownerName: pb.owner_name, nodes: sideB },
    {},
  );
}

/**
 * Ядро склейки двух родословных через общего человека. Стороны
 * ориентируются детерминированно: базой становится БОЛЬШЕЕ древо, меньшее
 * прирастает к нему и помечается как добавленная ветвь (merge_added) —
 * и в предпросмотре, и в опубликованном древе картина одна и та же.
 */
async function buildMergedTree(
  rawA: MergeSide,
  rawB: MergeSide,
  header: MergedHeader,
): Promise<TreeNode[]> {
  // node-pg отдаёт BIGINT строками — приводим к числам сразу, иначе
  // сравнения id не сработают и ветки не сольются.
  const num = (v: number | null): number | null =>
    v == null ? null : Number(v);
  const norm = (n: TreeNode): TreeNode => ({
    ...n,
    id: Number(n.id),
    birth_year: num(n.birth_year),
    death_year: num(n.death_year),
    father_id: num(n.father_id),
    mother_id: num(n.mother_id),
  });
  let sideA: MergeSide = { ...rawA, nodes: rawA.nodes.map(norm) };
  let sideB: MergeSide = { ...rawB, nodes: rawB.nodes.map(norm) };

  // Якорь обязан быть в своей стороне — иначе склейке не от чего идти.
  const ensureAnchor = async (
    list: TreeNode[],
    anchorId: number,
  ): Promise<void> => {
    if (list.some((n) => n.id === anchorId)) return;
    const extra = await query<TreeNode>(
      `SELECT id, full_name, gender, birth_year, death_year,
              father_id, mother_id, spouse_names, 0 AS depth
       FROM persons WHERE id = $1`,
      [anchorId],
    );
    if (extra.length > 0) list.push(norm(extra[0]));
  };
  await ensureAnchor(sideA.nodes, sideA.anchorId);
  await ensureAnchor(sideB.nodes, sideB.anchorId);

  // База — большее древо: присоединённой (и подсвеченной) всегда
  // считается меньшая ветвь, независимо от порядка якорей в записи.
  if (sideB.nodes.length > sideA.nodes.length) {
    const t = sideA;
    sideA = sideB;
    sideB = t;
  }
  const anchorA = sideA.anchorId;
  const anchorB = sideB.anchorId;
  const nodesA = sideA.nodes;
  const nodesB = sideB.nodes;

  const byIdA = new Map(nodesA.map((n) => [n.id, n]));
  const byIdB = new Map(nodesB.map((n) => [n.id, n]));

  // Сходство имён всех пар A×B одним запросом — комбинированная формула
  // (та же, что в чек-листе): триграммы + нормализация написания +
  // Левенштейн. Порог минимальный (как у отцов), точнее фильтруем уже
  // при матчинге.
  const simRows = await query<{ a_id: number; b_id: number; sim: number }>(
    `SELECT a.id AS a_id, b.id AS b_id,
            ${nameSimSql("a.full_name", "b.full_name")} AS sim
     FROM persons a
     JOIN persons b
       ON ${nameSimSql("a.full_name", "b.full_name")} >= ${FATHER_MIN_SIMILARITY}
     WHERE a.id = ANY($1::bigint[]) AND b.id = ANY($2::bigint[])`,
    [nodesA.map((n) => n.id), nodesB.map((n) => n.id)],
  );
  const simMap = new Map<string, number>();
  for (const r of simRows)
    simMap.set(`${Number(r.a_id)}:${Number(r.b_id)}`, Number(r.sim));
  const simOf = (aId: number, bId: number): number =>
    simMap.get(`${aId}:${bId}`) ?? 0;

  // Индекс детей по родителю для обеих сторон.
  const childrenIndex = (nodes: TreeNode[]): Map<number, TreeNode[]> => {
    const map = new Map<number, TreeNode[]>();
    for (const n of nodes) {
      for (const pid of [n.father_id, n.mother_id]) {
        if (pid == null) continue;
        const list = map.get(pid);
        if (list) list.push(n);
        else map.set(pid, [n]);
      }
    }
    return map;
  };
  const kidsA = childrenIndex(nodesA);
  const kidsB = childrenIndex(nodesB);

  // Рекурсивная склейка от точки соединения: от пары якорей идём вверх
  // (родители) и вниз (дети), приравнивая совпадающих людей. Каждый общий
  // человек остаётся в итоговом древе один раз.
  const matched = new Map<number, number>(); // id в древе B -> id в древе A
  const usedA = new Set<number>();
  const queue: Array<[number, number]> = [];
  const pairUp = (aId: number, bId: number): void => {
    if (matched.has(bId) || usedA.has(aId)) return;
    matched.set(bId, aId);
    usedA.add(aId);
    queue.push([aId, bId]);
  };
  pairUp(anchorA, anchorB);

  const yearsClose = (a: TreeNode, b: TreeNode): boolean =>
    a.birth_year == null ||
    b.birth_year == null ||
    Math.abs(a.birth_year - b.birth_year) <= 10;

  while (queue.length > 0) {
    const [aId, bId] = queue.shift()!;
    const a = byIdA.get(aId);
    const b = byIdB.get(bId);
    if (!a || !b) continue;

    // Родители: порог тот же, что в проверке «два разных отца»
    // (более сильное расхождение блокируется ещё чек-листом).
    for (const key of ["father_id", "mother_id"] as const) {
      const pa = a[key];
      const pb = b[key];
      if (pa == null || pb == null) continue;
      if (simOf(pa, pb) >= FATHER_MIN_SIMILARITY) pairUp(pa, pb);
    }

    // Дети: совпадает пол, имя похоже, года рождения не расходятся.
    // Если года практически совпадают — порог имени мягче (вариант
    // написания), иначе требуем заметное сходство. Жадно от самых
    // похожих пар, чтобы тёзки не перепутались.
    const listA = kidsA.get(aId) ?? [];
    const listB = kidsB.get(bId) ?? [];
    const cand: Array<{ ca: TreeNode; cb: TreeNode; s: number }> = [];
    for (const ca of listA) {
      for (const cb of listB) {
        if (ca.gender !== cb.gender) continue;
        if (!yearsClose(ca, cb)) continue;
        const sameYear =
          ca.birth_year != null &&
          cb.birth_year != null &&
          Math.abs(ca.birth_year - cb.birth_year) <= 1;
        const s = simOf(ca.id, cb.id);
        if (s >= (sameYear ? FATHER_MIN_SIMILARITY : CHECK_NAME_OK))
          cand.push({ ca, cb, s });
      }
    }
    cand.sort((x, y) => y.s - x.s);
    for (const { ca, cb } of cand) pairUp(ca.id, cb.id);
  }

  const remap = (id: number | null): number | null =>
    id == null ? null : (matched.get(id) ?? id);

  // Сборка: сторона A целиком; из B — только несовпавшие люди, их связи
  // переводятся на общие узлы (так ветвь Б прирастает через точку
  // соединения). Совпавшие узлы B дополняют узел A недостающими сведениями
  // и связями: якорь A получает потомков якоря B, а если у него не указан
  // родитель — родителя из древа B. Несовпавшие узлы B помечаются как
  // «добавленные при объединении» — интерфейс выделяет всю новую ветвь.
  const mergeAuthor = sideB.ownerName?.trim() || null;
  const byId = new Map<number, TreeNode>();
  for (const n of nodesA) byId.set(n.id, { ...n });
  for (const n of nodesB) {
    const aId = matched.get(n.id);
    if (aId != null) {
      const target = byId.get(aId);
      if (!target) continue;
      if (target.birth_year == null) target.birth_year = n.birth_year;
      if (target.death_year == null) target.death_year = n.death_year;
      if (
        (!target.spouse_names || target.spouse_names.length === 0) &&
        n.spouse_names &&
        n.spouse_names.length > 0
      )
        target.spouse_names = n.spouse_names;
      if (target.father_id == null && n.father_id != null)
        target.father_id = remap(n.father_id);
      if (target.mother_id == null && n.mother_id != null)
        target.mother_id = remap(n.mother_id);
      continue;
    }
    byId.set(n.id, {
      ...n,
      father_id: remap(n.father_id),
      mother_id: remap(n.mother_id),
      merge_added: true,
      merge_author: mergeAuthor,
    });
  }

  // Поля, выбранные модератором, — на подтверждённой паре.
  const anchor = byId.get(anchorA);
  if (anchor) {
    if (header.merged_name != null && header.merged_name.trim())
      anchor.full_name = header.merged_name;
    if (header.merged_birth_year != null)
      anchor.birth_year = Number(header.merged_birth_year);
    if (header.merged_death_year != null)
      anchor.death_year = Number(header.merged_death_year);
  }

  // Метка «точка объединения» — на самом верхнем общем человеке: если
  // совпала не только подтверждённая пара, но и её предки (отец, дед...),
  // древа реально соединяются выше по стволу — поднимаем метку туда.
  // Добавленные ветвью предки (merge_added) общими не считаются.
  let anchorTop = anchor;
  const climbed = new Set<number>();
  while (
    anchorTop &&
    anchorTop.father_id != null &&
    usedA.has(anchorTop.father_id) &&
    !climbed.has(anchorTop.id)
  ) {
    climbed.add(anchorTop.id);
    const up = byId.get(anchorTop.father_id);
    if (!up) break;
    anchorTop = up;
  }
  if (anchorTop) anchorTop.merge_anchor = true;

  // Ссылки на родителей вне собранного набора обнуляем: такие узлы —
  // корни своих ветвей.
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

/** Сводка по объединённому древу — для карточек каталога и модерации. */
export interface MergedTreeStats {
  /** Всего людей в целом объединённом древе (общие — один раз). */
  total: number;
  /** Сколько новых людей добавила присоединённая ветвь. */
  added_count: number;
  root_id: number | null;
  /** Первопредок (корень) целого древа — его именем называется древо. */
  root_name: string | null;
  root_birth_year: number | null;
  root_death_year: number | null;
}

/**
 * Считает сводку тем же алгоритмом, каким собирается само древо, — цифры
 * на карточке совпадают с тем, что человек увидит, открыв его. Первопредок
 * определяется подъёмом от точки соединения по отцовской линии до корня:
 * если присоединённая ветвь добавила предков НАД точкой соединения, корень
 * (и название древа) смещается на них — пересчёт после объединения.
 */
export function statsFromMergedNodes(nodes: TreeNode[]): MergedTreeStats {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const anchor = nodes.find((n) => n.merge_anchor) ?? nodes[0] ?? null;

  let root = anchor;
  const seen = new Set<number>();
  while (root && root.father_id != null && !seen.has(root.id)) {
    seen.add(root.id);
    const up = byId.get(root.father_id);
    if (!up) break;
    root = up;
  }

  return {
    total: nodes.length,
    added_count: nodes.filter((n) => n.merge_added).length,
    root_id: root ? root.id : null,
    root_name: root ? root.full_name : null,
    root_birth_year: root ? root.birth_year : null,
    root_death_year: root ? root.death_year : null,
  };
}

export async function getMergedTreeStats(
  mergeId: number,
  viewer: Viewer = ANON,
): Promise<MergedTreeStats> {
  return statsFromMergedNodes(await getMergedTree(mergeId, viewer));
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
