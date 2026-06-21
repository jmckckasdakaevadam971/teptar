import { env } from '../../config/env.js';

// Эндпоинт проверки токена Cloudflare Turnstile.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** true — проверка пропущена (секрет не настроен). */
  skipped?: boolean;
  errors?: string[];
}

/**
 * Проверяет токен Cloudflare Turnstile («проверка на бота»).
 *
 * Поведение:
 *  • Если TURNSTILE_SECRET не задан — проверка ПРОПУСКАЕТСЯ (ok=true), чтобы
 *    сайт работал без капчи, пока ключи Cloudflare не настроены.
 *  • Если секрет задан, а токен отсутствует/неверный — ok=false.
 *
 * Использует глобальный fetch (есть в Node 18+).
 */
export async function verifyTurnstile(token: string | undefined): Promise<TurnstileResult> {
  const secret = env.turnstileSecret;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, errors: ['missing-token'] };

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };
    return { ok: data.success === true, errors: data['error-codes'] };
  } catch {
    return { ok: false, errors: ['verify-request-failed'] };
  }
}
