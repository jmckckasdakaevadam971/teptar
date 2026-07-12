import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/http.js";
import { resolveTeipIdByName } from "../teips/teips.service.js";

// ============================================================================
//  «Хранители тептара» — модераторы-знатоки своих тейпов.
//  Пользователь подаёт заявку → супер-админ одобряет → роль teip_admin
//  + закрепление тейпа в admin_assignments (модерация только своего тейпа).
// ============================================================================

export interface KeeperTeip {
  id: number;
  name: string;
}

/** Публичная карточка хранителя (для страницы «Хранители»). */
export interface Keeper {
  user_id: number;
  display_name: string;
  teips: string[];
  since: string;
}

export interface KeeperApplication {
  id: number;
  user_id: number;
  display_name: string;
  email: string | null;
  teip_id: number | null;
  teip_name: string;
  village: string | null;
  experience: string;
  contact: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

/** Публичный список хранителей: модераторы с закреплёнными тейпами. */
export async function listKeepers(): Promise<Keeper[]> {
  return query<Keeper>(
    `SELECT u.id AS user_id,
            u.display_name,
            array_agg(DISTINCT t.name) AS teips,
            MIN(aa.created_at)::text AS since
     FROM users u
     JOIN admin_assignments aa ON aa.user_id = u.id
     JOIN teips t ON t.id = aa.teip_id
     WHERE u.role IN ('teip_admin','super_admin')
     GROUP BY u.id, u.display_name
     ORDER BY MIN(aa.created_at), u.id`,
  );
}

/** Тейпы, закреплённые за пользователем. */
export async function getUserTeips(userId: number): Promise<KeeperTeip[]> {
  return query<KeeperTeip>(
    `SELECT DISTINCT t.id, t.name
     FROM admin_assignments aa JOIN teips t ON t.id = aa.teip_id
     WHERE aa.user_id = $1 ORDER BY t.name`,
    [userId],
  );
}

/** Статус заявителя: уже хранитель? есть ли заявка? */
export async function getMyKeeperStatus(userId: number): Promise<{
  is_keeper: boolean;
  teips: KeeperTeip[];
  application: KeeperApplication | null;
}> {
  const users = await query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1",
    [userId],
  );
  if (users.length === 0) throw new ApiError(404, "Пользователь не найден");
  const isKeeper =
    users[0].role === "teip_admin" || users[0].role === "super_admin";

  const apps = await query<KeeperApplication>(
    `SELECT ka.id, ka.user_id, u.display_name, u.email,
            ka.teip_id, ka.teip_name, ka.village, ka.experience, ka.contact,
            ka.status, ka.created_at::text
     FROM keeper_applications ka JOIN users u ON u.id = ka.user_id
     WHERE ka.user_id = $1
     ORDER BY ka.created_at DESC LIMIT 1`,
    [userId],
  );

  return {
    is_keeper: isKeeper,
    teips: isKeeper ? await getUserTeips(userId) : [],
    application: apps[0] ?? null,
  };
}

/** Подать заявку «Стать хранителем». */
export async function applyKeeper(
  userId: number,
  input: {
    teip_id?: number | null;
    teip_name?: string;
    village?: string | null;
    experience: string;
    contact?: string | null;
  },
): Promise<KeeperApplication> {
  // Хранитель отвечает только за свой тейп: заявка подаётся по тейпу из
  // профиля заявителя. Выбор тейпа вручную остаётся только для старых
  // аккаунтов, у которых тейп в профиле не указан.
  const me = await query<{ teip_id: number | null }>(
    "SELECT teip_id FROM users WHERE id = $1",
    [userId],
  );
  if (me.length === 0) throw new ApiError(404, "Пользователь не найден");
  const ownTeipId = me[0].teip_id;

  let teipId: number | null;
  let teipName: string;
  if (ownTeipId != null) {
    teipId = Number(ownTeipId);
    const teips = await query<{ name: string }>(
      "SELECT name FROM teips WHERE id = $1",
      [teipId],
    );
    teipName = teips[0]?.name ?? "";
  } else {
    teipId = input.teip_id ?? null;
    teipName = (input.teip_name ?? "").trim();
    if (teipId != null) {
      const teips = await query<{ name: string }>(
        "SELECT name FROM teips WHERE id = $1",
        [teipId],
      );
      if (teips.length === 0) {
        teipId = null; // тейпа нет в справочнике — оставим текстом
      } else {
        teipName = teips[0].name;
      }
    }
  }
  if (!teipName) throw new ApiError(400, "Укажите тейп");

  const pending = await query<{ id: number }>(
    `SELECT id FROM keeper_applications WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  if (pending.length > 0) {
    throw new ApiError(409, "Ваша заявка уже на рассмотрении");
  }

  const rows = await query<KeeperApplication>(
    `INSERT INTO keeper_applications (user_id, teip_id, teip_name, village, experience, contact)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, user_id, '' AS display_name, NULL AS email,
               teip_id, teip_name, village, experience, contact, status,
               created_at::text`,
    [
      userId,
      teipId,
      teipName,
      input.village ?? null,
      input.experience,
      input.contact ?? null,
    ],
  );
  return rows[0];
}

/** Очередь заявок для супер-админа (старые сверху — по очереди). */
export async function listApplications(): Promise<KeeperApplication[]> {
  return query<KeeperApplication>(
    `SELECT ka.id, ka.user_id, u.display_name, u.email,
            ka.teip_id, ka.teip_name, ka.village, ka.experience, ka.contact,
            ka.status, ka.created_at::text
     FROM keeper_applications ka JOIN users u ON u.id = ka.user_id
     WHERE ka.status = 'pending'
     ORDER BY ka.created_at ASC`,
  );
}

interface ResolvedApplication {
  user_id: number;
  email: string | null;
  display_name: string;
  teip_id: number | null;
  teip_name: string;
}

/**
 * Одобрить заявку: роль teip_admin + закрепление своего тейпа.
 * Эффективный тейп — из профиля заявителя (приоритет) или из заявки;
 * если в профиле тейп не указан — дописывается. Хранитель закрепляется
 * ровно за одним — своим — тейпом.
 * Возвращает контакт заявителя для письма-уведомления.
 */
export async function approveApplication(
  appId: number,
  adminId: number,
): Promise<ResolvedApplication> {
  return withTransaction(async (client) => {
    const apps = await client.query<
      ResolvedApplication & { status: string; user_teip_id: number | null }
    >(
      `SELECT ka.user_id, ka.teip_id, ka.teip_name, ka.status,
              u.email, u.display_name, u.teip_id AS user_teip_id
       FROM keeper_applications ka JOIN users u ON u.id = ka.user_id
       WHERE ka.id = $1 FOR UPDATE`,
      [appId],
    );
    const app = apps.rows[0];
    if (!app) throw new ApiError(404, "Заявка не найдена");
    if (app.status !== "pending")
      throw new ApiError(409, "Заявка уже рассмотрена");

    const effectiveTeipId = app.user_teip_id ?? app.teip_id;
    if (effectiveTeipId == null) {
      throw new ApiError(
        400,
        `Тейп «${app.teip_name}» отсутствует в справочнике, а в профиле заявителя тейп не указан — закрепить хранителя не за что. Добавьте тейп в справочник и попросите подать заявку заново.`,
      );
    }

    await client.query(
      `UPDATE keeper_applications
       SET status = 'approved', resolved_by = $2, resolved_at = now()
       WHERE id = $1`,
      [appId, adminId],
    );

    // Дописываем тейп в профиль, если там пусто (старые аккаунты).
    await client.query(
      `UPDATE users SET teip_id = $2 WHERE id = $1 AND teip_id IS NULL`,
      [app.user_id, effectiveTeipId],
    );

    // Повышаем роль (админов не трогаем).
    await client.query(
      `UPDATE users SET role = 'teip_admin'
       WHERE id = $1 AND role IN ('viewer','editor')`,
      [app.user_id],
    );

    // Закрепляем ровно свой тейп: чужие закрепления убираем. NULL-village
    // дубли не ловятся UNIQUE-ограничением, поэтому проверяем вручную.
    await client.query(
      `DELETE FROM admin_assignments WHERE user_id = $1 AND teip_id <> $2`,
      [app.user_id, effectiveTeipId],
    );
    const exists = await client.query(
      `SELECT 1 FROM admin_assignments
       WHERE user_id = $1 AND teip_id = $2 AND village_id IS NULL`,
      [app.user_id, effectiveTeipId],
    );
    if ((exists.rowCount ?? 0) === 0) {
      await client.query(
        `INSERT INTO admin_assignments (user_id, teip_id, village_id)
         VALUES ($1,$2,NULL)`,
        [app.user_id, effectiveTeipId],
      );
    }

    const teipNames = await client.query<{ name: string }>(
      `SELECT name FROM teips WHERE id = $1`,
      [effectiveTeipId],
    );
    return {
      ...app,
      teip_id: effectiveTeipId,
      teip_name: teipNames.rows[0]?.name ?? app.teip_name,
    };
  });
}

/**
 * Добавить тейп из заявки хранителя в справочник (супер-админ).
 * Если название уже есть (тейп или алиас) — дубль не создаётся. Тейп
 * проставляется в заявку и в профиль заявителя, попутно закрываются
 * одноимённые заявки на тейп из регистраций.
 */
export async function createTeipFromApplication(
  appId: number,
  adminId: number,
  tukhumId: number | null = null,
): Promise<{ teip_id: number; teip_name: string }> {
  const apps = await query<{
    id: number;
    user_id: number;
    teip_id: number | null;
    teip_name: string;
    status: string;
  }>(
    `SELECT id, user_id, teip_id, teip_name, status FROM keeper_applications WHERE id = $1`,
    [appId],
  );
  const app = apps[0];
  if (!app) throw new ApiError(404, "Заявка не найдена");
  if (app.status !== "pending")
    throw new ApiError(409, "Заявка уже рассмотрена");
  if (app.teip_id != null)
    throw new ApiError(409, "У заявки уже указан тейп из справочника");

  if (tukhumId != null) {
    const tk = await query(`SELECT id FROM tukhums WHERE id = $1`, [tukhumId]);
    if (tk.length === 0) throw new ApiError(404, "Тукхум не найден");
  }

  const existingId = await resolveTeipIdByName(app.teip_name);

  return withTransaction(async (client) => {
    let teipId = existingId;
    let teipName = app.teip_name.trim();
    if (teipId == null) {
      const ins = await client.query<{ id: number; name: string }>(
        `INSERT INTO teips (name, tukhum_id) VALUES ($1, $2) RETURNING id, name`,
        [teipName, tukhumId],
      );
      teipId = ins.rows[0].id;
      teipName = ins.rows[0].name;
    } else {
      const t = await client.query<{ name: string }>(
        `SELECT name FROM teips WHERE id = $1`,
        [teipId],
      );
      teipName = t.rows[0]?.name ?? teipName;
    }

    await client.query(
      `UPDATE keeper_applications SET teip_id = $2 WHERE id = $1`,
      [appId, teipId],
    );
    await client.query(
      `UPDATE users SET teip_id = $2 WHERE id = $1 AND teip_id IS NULL`,
      [app.user_id, teipId],
    );
    // Одноимённые заявки на тейп из регистраций закрываем и прикрепляем людей.
    const reqs = await client.query<{ requested_by: number | null }>(
      `UPDATE teip_requests
       SET status = 'approved', resolved_teip_id = $2, resolved_by = $3, resolved_at = now()
       WHERE status = 'pending' AND lower(name) = lower($1)
       RETURNING requested_by`,
      [app.teip_name, teipId, adminId],
    );
    const userIds = reqs.rows
      .map((r) => r.requested_by)
      .filter((v): v is number => v != null);
    if (userIds.length > 0) {
      await client.query(
        `UPDATE users SET teip_id = $1 WHERE id = ANY($2::bigint[]) AND teip_id IS NULL`,
        [teipId, userIds],
      );
    }
    return { teip_id: teipId, teip_name: teipName };
  });
}

/** Отклонить заявку. Возвращает контакт заявителя для письма. */
export async function rejectApplication(
  appId: number,
  adminId: number,
): Promise<ResolvedApplication> {
  const rows = await query<ResolvedApplication>(
    `UPDATE keeper_applications ka
     SET status = 'rejected', resolved_by = $2, resolved_at = now()
     FROM users u
     WHERE ka.id = $1 AND ka.status = 'pending' AND u.id = ka.user_id
     RETURNING ka.user_id, ka.teip_id, ka.teip_name, u.email, u.display_name`,
    [appId, adminId],
  );
  if (rows.length === 0)
    throw new ApiError(404, "Заявка не найдена или уже рассмотрена");
  return rows[0];
}
