import type { PoolClient } from "pg";
import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";

export interface TeipRow {
  id: number;
  tukhum_id: number | null;
  name: string;
  description: string | null;
  origin_place: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  tukhum_name?: string | null;
  tukhum_approx_lat?: number | null;
  tukhum_approx_lng?: number | null;
  aliases?: string[];
}

export interface GarRow {
  id: number;
  teip_id: number;
  name: string;
  description: string | null;
}

export async function listTeips(): Promise<TeipRow[]> {
  return query<TeipRow>(
    `SELECT t.*, tk.name AS tukhum_name,
            tk.approx_lat AS tukhum_approx_lat, tk.approx_lng AS tukhum_approx_lng,
            COALESCE((SELECT array_agg(a.name ORDER BY a.name)
                      FROM teip_aliases a WHERE a.teip_id = t.id), '{}') AS aliases
     FROM teips t
     LEFT JOIN tukhums tk ON tk.id = t.tukhum_id
     ORDER BY t.name`,
  );
}

export async function getTeip(id: number): Promise<TeipRow | undefined> {
  const rows = await query<TeipRow>(
    `SELECT t.*, tk.name AS tukhum_name,
            tk.approx_lat AS tukhum_approx_lat, tk.approx_lng AS tukhum_approx_lng
     FROM teips t
     LEFT JOIN tukhums tk ON tk.id = t.tukhum_id
     WHERE t.id = $1`,
    [id],
  );
  return rows[0];
}

export async function listGars(teipId: number): Promise<GarRow[]> {
  return query<GarRow>("SELECT * FROM gars WHERE teip_id = $1 ORDER BY name", [
    teipId,
  ]);
}

export async function createTeip(
  name: string,
  description: string | null,
  tukhumId: number | null,
): Promise<TeipRow> {
  const rows = await query<TeipRow>(
    `INSERT INTO teips (name, description, tukhum_id) VALUES ($1,$2,$3) RETURNING *`,
    [name, description, tukhumId],
  );
  return rows[0];
}

export interface TeipOriginInput {
  origin_place: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
}

export interface TeipUpdateInput {
  name?: string;
  description?: string | null;
  tukhum_id?: number | null;
}

/** Обновить основные поля тейпа: название, описание, тукхум (супер-админ). */
export async function updateTeip(
  id: number,
  input: TeipUpdateInput,
): Promise<TeipRow> {
  const teip = await getTeip(id);
  if (!teip) throw new ApiError(404, "Тейп не найден");

  if (input.name !== undefined && input.name.trim() !== teip.name) {
    // Название не должно совпадать с другим тейпом или его алиасом.
    const existing = await resolveTeipIdByName(input.name);
    if (existing != null && existing !== id) {
      throw new ApiError(409, "Такое название уже есть в справочнике");
    }
  }
  if (input.tukhum_id != null) {
    const rows = await query<{ id: number }>(
      `SELECT id FROM tukhums WHERE id = $1`,
      [input.tukhum_id],
    );
    if (rows.length === 0) throw new ApiError(404, "Тукхум не найден");
  }

  // Сливаем поля в JS и пишем итоговые значения — просто и предсказуемо.
  const next = {
    name: input.name !== undefined ? input.name.trim() : teip.name,
    description:
      input.description !== undefined ? input.description : teip.description,
    tukhum_id:
      input.tukhum_id !== undefined ? input.tukhum_id : teip.tukhum_id,
  };
  await query(
    `UPDATE teips SET name = $2, description = $3, tukhum_id = $4 WHERE id = $1`,
    [id, next.name, next.description, next.tukhum_id],
  );
  // Возвращаем обогащённую строку (с tukhum_name) — фронт обновит карточку.
  return (await getTeip(id))!;
}

/**
 * Удалить тейп из справочника (супер-админ). Запрещено, если к тейпу
 * привязаны одобренные персоны — сначала нужно перенести их данные.
 * Профили пользователей и заявки отвязываются автоматически (SET NULL).
 */
export async function deleteTeip(id: number): Promise<void> {
  const teip = await getTeip(id);
  if (!teip) throw new ApiError(404, "Тейп не найден");
  const persons = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM persons WHERE teip_id = $1`,
    [id],
  );
  if (Number(persons[0]?.count ?? 0) > 0) {
    throw new ApiError(
      409,
      "К тейпу привязаны персоны в родословных — удалить нельзя",
    );
  }
  await query(`DELETE FROM teips WHERE id = $1`, [id]);
}

/** Обновить место основания тейпа (для метки на карте). */
export async function updateTeipOrigin(
  id: number,
  input: TeipOriginInput,
): Promise<TeipRow | undefined> {
  const rows = await query<TeipRow>(
    `UPDATE teips SET origin_place = $2, origin_lat = $3, origin_lng = $4
     WHERE id = $1 RETURNING *`,
    [id, input.origin_place, input.origin_lat, input.origin_lng],
  );
  return rows[0];
}

/** Статистика по тейпу: сколько персон внесено. */
export async function teipStats(id: number): Promise<{ persons: number }> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM persons WHERE teip_id = $1 AND status = 'approved'`,
    [id],
  );
  return { persons: Number(rows[0]?.count ?? 0) };
}

// ============================================================================
//  Открытый справочник: алиасы (варианты написания) и заявки на тейп.
//  Точного научного числа тейпов нет, поэтому неизвестные названия не
//  блокируют регистрацию, а уходят заявкой на решение супер-админа.
// ============================================================================

/**
 * Нормализация названия для сравнения: регистр не важен, а «Ӏ» (палочка),
 * латинские I/l/i и «!»/«|» считаются одной буквой — их постоянно путают.
 */
export function normalizeTeipName(s: string): string {
  return s.trim().toLowerCase().replace(/[ӏіil|!1]/g, "1");
}

/** Найти тейп по названию ИЛИ алиасу (без учёта регистра и написания «Ӏ»). */
export async function resolveTeipIdByName(name: string): Promise<number | null> {
  const norm = normalizeTeipName(name);
  if (!norm) return null;
  // Справочник маленький (сотни строк) — сравниваем в JS, чтобы применить
  // одну и ту же нормализацию к обеим сторонам.
  const rows = await query<{ id: number; name: string }>(
    `SELECT id, name FROM teips
     UNION ALL
     SELECT teip_id AS id, name FROM teip_aliases`,
  );
  return rows.find((r) => normalizeTeipName(r.name) === norm)?.id ?? null;
}

export interface TeipAliasRow {
  id: number;
  teip_id: number;
  name: string;
}

/** Добавить тейпу вариант написания (супер-админ). */
export async function createTeipAlias(
  teipId: number,
  name: string,
): Promise<TeipAliasRow> {
  const teip = await getTeip(teipId);
  if (!teip) throw new ApiError(404, "Тейп не найден");
  const existing = await resolveTeipIdByName(name);
  if (existing != null) {
    throw new ApiError(
      409,
      existing === teipId
        ? "Такое название у этого тейпа уже есть"
        : "Такое название уже занято другим тейпом в справочнике",
    );
  }
  const rows = await query<TeipAliasRow>(
    `INSERT INTO teip_aliases (teip_id, name) VALUES ($1, $2) RETURNING id, teip_id, name`,
    [teipId, name.trim()],
  );
  return rows[0];
}

/** Удалить вариант написания (супер-админ). */
export async function deleteTeipAlias(aliasId: number): Promise<void> {
  const rows = await query<{ id: number }>(
    `DELETE FROM teip_aliases WHERE id = $1 RETURNING id`,
    [aliasId],
  );
  if (rows.length === 0) throw new ApiError(404, "Алиас не найден");
}

export interface TeipRequestRow {
  id: number;
  name: string;
  status: string;
  created_at: string;
  requested_by: number | null;
  requester_name: string | null;
  requester_email: string | null;
}

/**
 * Создать заявку на добавление тейпа (вызывается при регистрации с
 * неизвестным тейпом). Повторная заявка того же пользователя на то же
 * название не дублируется.
 */
export async function createTeipRequest(
  name: string,
  userId: number | null,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const dup = await query<{ id: number }>(
    `SELECT id FROM teip_requests
     WHERE status = 'pending' AND lower(name) = lower($1)
       AND requested_by IS NOT DISTINCT FROM $2`,
    [trimmed, userId],
  );
  if (dup.length > 0) return;
  await query(`INSERT INTO teip_requests (name, requested_by) VALUES ($1, $2)`, [
    trimmed,
    userId,
  ]);
}

/** Очередь заявок на тейпы (для супер-админа). */
export async function listTeipRequests(): Promise<TeipRequestRow[]> {
  return query<TeipRequestRow>(
    `SELECT r.id, r.name, r.status, r.created_at, r.requested_by,
            u.display_name AS requester_name, u.email AS requester_email
     FROM teip_requests r
     LEFT JOIN users u ON u.id = r.requested_by
     WHERE r.status = 'pending'
     ORDER BY lower(r.name), r.created_at`,
  );
}

/**
 * Закрыть разом ВСЕ pending-заявки с тем же названием и проставить тейп
 * заявителям, у которых он ещё не указан.
 */
async function finalizeRequests(
  client: PoolClient,
  name: string,
  teipId: number,
  adminId: number,
  status: "approved" | "mapped" | "rejected",
): Promise<void> {
  const res = await client.query<{ requested_by: number | null }>(
    `UPDATE teip_requests
     SET status = $2, resolved_teip_id = $3, resolved_by = $4, resolved_at = now()
     WHERE status = 'pending' AND lower(name) = lower($1)
     RETURNING requested_by`,
    [name, status, status === "rejected" ? null : teipId, adminId],
  );
  if (status === "rejected") return;
  const userIds = res.rows
    .map((r) => r.requested_by)
    .filter((v): v is number => v != null);
  if (userIds.length > 0) {
    await client.query(
      `UPDATE users SET teip_id = $1 WHERE id = ANY($2::bigint[]) AND teip_id IS NULL`,
      [teipId, userIds],
    );
  }
}

/** Взять заявку под замок и проверить, что она ещё не рассмотрена. */
async function lockPendingRequest(
  client: PoolClient,
  requestId: number,
): Promise<{ id: number; name: string; status: string }> {
  const { rows } = await client.query<{ id: number; name: string; status: string }>(
    `SELECT id, name, status FROM teip_requests WHERE id = $1 FOR UPDATE`,
    [requestId],
  );
  const req = rows[0];
  if (!req) throw new ApiError(404, "Заявка не найдена");
  if (req.status !== "pending") throw new ApiError(409, "Заявка уже рассмотрена");
  return req;
}

/**
 * Одобрить заявку: создать тейп с этим названием. Если такое название уже
 * есть в справочнике (тейп или алиас) — дубль не создаётся, заявители
 * привязываются к существующему тейпу.
 */
export async function approveTeipRequest(
  requestId: number,
  adminId: number,
): Promise<TeipRow> {
  return withTransaction(async (client) => {
    const req = await lockPendingRequest(client, requestId);
    const existingId = await resolveTeipIdByName(req.name);
    let teip: TeipRow;
    if (existingId != null) {
      teip = (await getTeip(existingId)) as TeipRow;
    } else {
      const ins = await client.query<TeipRow>(
        `INSERT INTO teips (name) VALUES ($1) RETURNING *`,
        [req.name.trim()],
      );
      teip = ins.rows[0];
    }
    await finalizeRequests(
      client,
      req.name,
      teip.id,
      adminId,
      existingId != null ? "mapped" : "approved",
    );
    return teip;
  });
}

/**
 * Привязать заявку как вариант написания существующего тейпа: название
 * становится алиасом, заявители прикрепляются к выбранному тейпу.
 */
export async function mapTeipRequest(
  requestId: number,
  adminId: number,
  teipId: number,
): Promise<TeipRow> {
  return withTransaction(async (client) => {
    const req = await lockPendingRequest(client, requestId);
    const teip = await getTeip(teipId);
    if (!teip) throw new ApiError(404, "Тейп не найден");
    const existingId = await resolveTeipIdByName(req.name);
    if (existingId == null) {
      await client.query(
        `INSERT INTO teip_aliases (teip_id, name) VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [teipId, req.name.trim()],
      );
    } else if (existingId !== teipId) {
      throw new ApiError(
        409,
        `Название «${req.name}» уже привязано к другому тейпу справочника`,
      );
    }
    await finalizeRequests(client, req.name, teipId, adminId, "mapped");
    return teip;
  });
}

/** Отклонить заявку (закрывает все одноимённые pending-заявки). */
export async function rejectTeipRequest(
  requestId: number,
  adminId: number,
): Promise<void> {
  await withTransaction(async (client) => {
    const req = await lockPendingRequest(client, requestId);
    await finalizeRequests(client, req.name, 0, adminId, "rejected");
  });
}
