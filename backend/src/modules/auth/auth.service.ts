import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';
import type { UserRole } from '../../middleware/auth.js';

interface UserRow {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  password_hash: string | null;
  role: UserRole;
}

/** Хеш пароля через scrypt (без внешних зависимостей). Формат: salt:hash. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const test = scryptSync(password, salt, 64);
  return hashBuf.length === test.length && timingSafeEqual(hashBuf, test);
}

function signToken(user: UserRow): string {
  return jwt.sign({ userId: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function publicUser(u: UserRow) {
  return { id: u.id, display_name: u.display_name, phone: u.phone, email: u.email, role: u.role };
}

export async function register(input: {
  display_name: string;
  phone?: string;
  email?: string;
  password: string;
}): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
  const existing = await query<UserRow>(
    'SELECT * FROM users WHERE (phone = $1 AND $1 IS NOT NULL) OR (email = $2 AND $2 IS NOT NULL)',
    [input.phone ?? null, input.email ?? null],
  );
  if (existing.length > 0) {
    throw new ApiError(409, 'Пользователь с таким телефоном или e-mail уже существует');
  }

  const rows = await query<UserRow>(
    `INSERT INTO users (display_name, phone, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'viewer') RETURNING *`,
    [input.display_name, input.phone ?? null, input.email ?? null, hashPassword(input.password)],
  );
  const user = rows[0];
  return { token: signToken(user), user: publicUser(user) };
}

export async function login(input: {
  login: string; // телефон или e-mail
  password: string;
}): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
  const rows = await query<UserRow>(
    'SELECT * FROM users WHERE phone = $1 OR email = $1',
    [input.login],
  );
  const user = rows[0];
  if (!user || !user.password_hash || !verifyPassword(input.password, user.password_hash)) {
    throw new ApiError(401, 'Неверный логин или пароль');
  }
  return { token: signToken(user), user: publicUser(user) };
}

/** Назначить пользователю роль/админство тейпа (только super_admin). */
export async function assignAdmin(input: {
  user_id: number;
  teip_id: number;
  village_id?: number | null;
}): Promise<void> {
  await query('UPDATE users SET role = $2 WHERE id = $1 AND role = $3', [
    input.user_id,
    'teip_admin',
    'viewer',
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
}

export async function getProfile(userId: number): Promise<UserProfile> {
  const rows = await query<UserProfile>(
    `SELECT u.id, u.display_name, u.phone, u.email, u.role, u.created_at,
            (SELECT COUNT(*)::int FROM persons WHERE created_by = u.id) AS persons_count,
            (SELECT id FROM persons
               WHERE created_by = u.id
               ORDER BY (father_id IS NOT NULL), COALESCE(birth_year, 9999), id
               LIMIT 1) AS root_person_id
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (rows.length === 0) throw new ApiError(404, 'Пользователь не найден');
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
    throw new ApiError(409, 'Такой телефон или e-mail уже занят другим пользователем');
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
  const rows = await query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) throw new ApiError(404, 'Пользователь не найден');
  if (!user.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    throw new ApiError(400, 'Текущий пароль неверен');
  }
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [
    userId,
    hashPassword(newPassword),
  ]);
}
