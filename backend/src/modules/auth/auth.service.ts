import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import { query } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/http.js";
import { sendVerificationCode } from "./mailer.js";
import {
  createTeipRequest,
  resolveTeipIdByName,
} from "../teips/teips.service.js";
import type { UserRole } from "../../middleware/auth.js";

interface UserRow {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  password_hash: string | null;
  role: UserRole;
  teip_id: number | null;
  village_id: number | null;
}

/** Хеш пароля через scrypt (без внешних зависимостей). Формат: salt:hash. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const test = scryptSync(password, salt, 64);
  return hashBuf.length === test.length && timingSafeEqual(hashBuf, test);
}

function signToken(user: UserRow): string {
  return jwt.sign({ userId: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    display_name: u.display_name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    teip_id: u.teip_id ?? null,
    village_id: u.village_id ?? null,
  };
}

/**
 * Проверка, что выбранное село существует в справочнике.
 * Возвращаем понятную 400-ошибку вместо 500 от нарушения FK.
 */
async function validateVillage(villageId: number): Promise<void> {
  const village = await query<{ id: number }>(
    "SELECT id FROM villages WHERE id = $1",
    [villageId],
  );
  if (village.length === 0) {
    throw new ApiError(400, "Выбранный населённый пункт не найден");
  }
}

/**
 * Определить тейп при регистрации. Явный id проверяется по справочнику;
 * свободный текст ищется по названиям И алиасам. Если тейп неизвестен —
 * регистрацию НЕ блокируем: пользователь создаётся без тейпа, а название
 * уходит заявкой супер-админу (открытый справочник: точного числа тейпов
 * не существует).
 */
async function resolveRegistrationTeip(input: {
  teip_id?: number | null;
  teip_name?: string | null;
}): Promise<{ teipId: number | null; pendingName: string | null }> {
  if (input.teip_id != null) {
    const rows = await query<{ id: number }>(
      "SELECT id FROM teips WHERE id = $1",
      [input.teip_id],
    );
    if (rows.length === 0) throw new ApiError(400, "Выбранный тейп не найден");
    return { teipId: input.teip_id, pendingName: null };
  }
  const name = input.teip_name?.trim() ?? "";
  if (!name) throw new ApiError(400, "Укажите тейп");
  const resolved = await resolveTeipIdByName(name);
  if (resolved != null) return { teipId: resolved, pendingName: null };
  return { teipId: null, pendingName: name };
}

/**
 * Прямая регистрация по e-mail (без кода подтверждения — используется,
 * когда SMTP недоступен). Регистрация по телефону запрещена полностью.
 */
export async function register(input: {
  display_name: string;
  email: string;
  password: string;
  teip_id?: number | null;
  teip_name?: string | null;
  village_id: number;
}): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
  const email = input.email.trim().toLowerCase();
  const existing = await query<UserRow>(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );
  if (existing.length > 0) {
    throw new ApiError(409, "Пользователь с таким e-mail уже существует");
  }
  const { teipId, pendingName } = await resolveRegistrationTeip(input);
  await validateVillage(input.village_id);

  const rows = await query<UserRow>(
    `INSERT INTO users (display_name, email, password_hash, role, teip_id, village_id)
     VALUES ($1,$2,$3,'viewer',$4,$5) RETURNING *`,
    [
      input.display_name,
      email,
      hashPassword(input.password),
      teipId,
      input.village_id,
    ],
  );
  const user = rows[0];
  // Неизвестный тейп → заявка супер-админу; после одобрения тейп
  // проставится пользователю автоматически.
  if (pendingName) await createTeipRequest(pendingName, user.id);
  return { token: signToken(user), user: publicUser(user) };
}

/**
 * Шаг 1 регистрации с подтверждением: проверяем e-mail, сохраняем заявку
 * и отправляем код. Пользователь СОЗДАЁТСЯ только после верного кода (шаг 2).
 * Повторный вызов для того же e-mail перезаписывает заявку и шлёт новый код
 * (но не чаще раза в минуту).
 */
export async function requestEmailVerification(input: {
  display_name: string;
  email: string;
  password: string;
  teip_id?: number | null;
  teip_name?: string | null;
  village_id: number;
}): Promise<{ pending: true; email: string }> {
  const email = input.email.trim().toLowerCase();

  const existing = await query<UserRow>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  if (existing.length > 0) {
    throw new ApiError(409, "Пользователь с таким e-mail уже существует");
  }
  const { teipId, pendingName } = await resolveRegistrationTeip(input);
  await validateVillage(input.village_id);

  // Антиспам: новый код на тот же адрес — не чаще раза в минуту.
  const recent = await query<{ created_at: string }>(
    `SELECT created_at FROM email_verifications
     WHERE email = $1 AND created_at > now() - interval '60 seconds'`,
    [email],
  );
  if (recent.length > 0) {
    throw new ApiError(
      429,
      "Код уже отправлен. Подождите минуту перед повторной отправкой.",
    );
  }

  const code = String(randomInt(100000, 1000000)); // 6 цифр

  await query(
    `INSERT INTO email_verifications (email, code, display_name, password_hash, teip_id, teip_name, village_id, attempts, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, now() + interval '15 minutes')
     ON CONFLICT (email) DO UPDATE SET
       code = EXCLUDED.code,
       display_name = EXCLUDED.display_name,
       password_hash = EXCLUDED.password_hash,
       teip_id = EXCLUDED.teip_id,
       teip_name = EXCLUDED.teip_name,
       village_id = EXCLUDED.village_id,
       attempts = 0,
       expires_at = EXCLUDED.expires_at,
       created_at = now()`,
    [
      email,
      code,
      input.display_name,
      hashPassword(input.password),
      teipId,
      pendingName,
      input.village_id,
    ],
  );

  try {
    await sendVerificationCode(email, code);
  } catch (e) {
    // Письмо не ушло — убираем заявку, чтобы не блокировать повтор
    // антиспам-паузой, и отдаём ошибку выше (контроллер решит, что делать).
    await query("DELETE FROM email_verifications WHERE email = $1", [email]);
    throw e;
  }
  return { pending: true, email };
}

/** Шаг 2: проверка кода и создание пользователя. */
export async function verifyEmail(input: {
  email: string;
  code: string;
}): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
  const email = input.email.trim().toLowerCase();

  const rows = await query<{
    id: number;
    code: string;
    display_name: string;
    password_hash: string;
    teip_id: number | null;
    teip_name: string | null;
    village_id: number | null;
    attempts: number;
    expired: boolean;
  }>(
    `SELECT id, code, display_name, password_hash, teip_id, teip_name, village_id, attempts, (expires_at < now()) AS expired
     FROM email_verifications WHERE email = $1`,
    [email],
  );
  const row = rows[0];
  if (!row || row.expired) {
    throw new ApiError(
      410,
      "Код истёк или не запрашивался. Отправьте код заново.",
    );
  }
  if (row.attempts >= 5) {
    throw new ApiError(
      429,
      "Слишком много неверных попыток. Отправьте код заново.",
    );
  }
  if (row.code !== input.code.trim()) {
    await query(
      "UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1",
      [row.id],
    );
    throw new ApiError(
      400,
      "Неверный код. Проверьте письмо и попробуйте ещё раз.",
    );
  }

  // Код верен — создаём пользователя (гонка с повторной регистрацией закрыта UNIQUE(email)).
  const existing = await query<UserRow>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  if (existing.length > 0) {
    await query("DELETE FROM email_verifications WHERE id = $1", [row.id]);
    throw new ApiError(409, "Пользователь с таким e-mail уже существует");
  }
  const created = await query<UserRow>(
    `INSERT INTO users (display_name, email, password_hash, role, teip_id, village_id)
     VALUES ($1,$2,$3,'viewer',$4,$5) RETURNING *`,
    [row.display_name, email, row.password_hash, row.teip_id, row.village_id],
  );
  await query("DELETE FROM email_verifications WHERE id = $1", [row.id]);

  const user = created[0];
  // Тейпа не было в справочнике на шаге 1 → заявка супер-админу.
  if (row.teip_id == null && row.teip_name) {
    await createTeipRequest(row.teip_name, user.id);
  }
  return { token: signToken(user), user: publicUser(user) };
}

export async function login(input: {
  login: string; // телефон или e-mail
  password: string;
}): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
  const rows = await query<UserRow>(
    "SELECT * FROM users WHERE phone = $1 OR email = $1",
    [input.login],
  );
  const user = rows[0];
  if (
    !user ||
    !user.password_hash ||
    !verifyPassword(input.password, user.password_hash)
  ) {
    throw new ApiError(401, "Неверный логин или пароль");
  }
  return { token: signToken(user), user: publicUser(user) };
}

/** Назначить пользователю роль/админство тейпа (только super_admin). */
export async function assignAdmin(input: {
  user_id: number;
  teip_id: number;
  village_id?: number | null;
}): Promise<void> {
  await query("UPDATE users SET role = $2 WHERE id = $1 AND role = $3", [
    input.user_id,
    "teip_admin",
    "viewer",
  ]);
  await query(
    `INSERT INTO admin_assignments (user_id, teip_id, village_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, teip_id, village_id) DO NOTHING`,
    [input.user_id, input.teip_id, input.village_id ?? null],
  );
}

/** Профиль пользователя: данные из БД + сводка по своему древу. */
export interface UserProfile {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
  persons_count: number;
  root_person_id: number | null;
  teip_id: number | null;
  teip_name: string | null;
  village_id: number | null;
  village_name: string | null;
}

export async function getProfile(userId: number): Promise<UserProfile> {
  const rows = await query<UserProfile>(
    `SELECT u.id, u.display_name, u.phone, u.email, u.role, u.created_at,
            u.teip_id, t.name AS teip_name,
            u.village_id, v.name AS village_name,
            (SELECT COUNT(*)::int FROM persons WHERE created_by = u.id) AS persons_count,
            COALESCE(
              u.root_person_id,
              (SELECT id FROM persons
                 WHERE created_by = u.id
                 ORDER BY (father_id IS NOT NULL), (mother_id IS NOT NULL),
                          COALESCE(birth_year, 9999), id
                 LIMIT 1)
            ) AS root_person_id
     FROM users u
     LEFT JOIN teips t    ON t.id = u.teip_id
     LEFT JOIN villages v ON v.id = u.village_id
     WHERE u.id = $1`,
    [userId],
  );
  if (rows.length === 0) throw new ApiError(404, "Пользователь не найден");
  return rows[0];
}

/** Обновить основные данные профиля (имя, телефон, e-mail). */
export async function updateProfile(
  userId: number,
  input: { display_name: string; phone?: string | null; email?: string | null },
): Promise<UserProfile> {
  const phone = input.phone ?? null;
  const email = input.email ?? null;

  const dup = await query<{ id: number }>(
    `SELECT id FROM users
     WHERE id <> $1 AND ((phone = $2 AND $2 IS NOT NULL) OR (email = $3 AND $3 IS NOT NULL))`,
    [userId, phone, email],
  );
  if (dup.length > 0) {
    throw new ApiError(
      409,
      "Такой телефон или e-mail уже занят другим пользователем",
    );
  }

  await query(
    `UPDATE users SET display_name = $2, phone = $3, email = $4 WHERE id = $1`,
    [userId, input.display_name, phone, email],
  );
  return getProfile(userId);
}

/** Смена пароля с проверкой текущего. */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const rows = await query<UserRow>("SELECT * FROM users WHERE id = $1", [
    userId,
  ]);
  const user = rows[0];
  if (!user) throw new ApiError(404, "Пользователь не найден");
  if (
    !user.password_hash ||
    !verifyPassword(currentPassword, user.password_hash)
  ) {
    throw new ApiError(400, "Текущий пароль неверен");
  }
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [
    userId,
    hashPassword(newPassword),
  ]);
}
