import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/http.js";

/**
 * Простой in-memory rate limiter (fixed window) без внешних зависимостей.
 * Достаточен против брутфорса паролей; при нескольких репликах backend
 * лимит фактически умножается на число реплик — это осознанный компромисс.
 *
 * ВАЖНО: требует `app.set('trust proxy', 1)`, т.к. за nginx req.ip
 * иначе всегда равен IP прокси-контейнера.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const {
    windowMs,
    max,
    message = "Слишком много попыток. Попробуйте позже.",
  } = options;
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Периодически чистим истёкшие записи, чтобы Map не рос бесконечно.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  cleanup.unref(); // не держим процесс живым ради таймера

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      throw new ApiError(429, message);
    }
    next();
  };
}
