import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/http.js';

/**
 * Централизованная обработка ошибок. Подключается последним в app.ts.
 * Превращает ApiError / ZodError / прочие в единый JSON-ответ.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Ошибки валидации Zod
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: 'Ошибка валидации',
      details: err.flatten(),
    });
    return;
  }

  // Наши контролируемые ошибки
  if (err instanceof ApiError) {
    res.status(err.status).json({
      success: false,
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Всё остальное — 500
  console.error('[error]', err);
  res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
}

/** 404 для несуществующих маршрутов. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Маршрут не найден' });
}
