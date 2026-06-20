import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';

export type UserRole = 'viewer' | 'editor' | 'teip_admin' | 'super_admin';

export interface AuthPayload {
  userId: number;
  role: UserRole;
}

// Расширяем Request, добавляя поле user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Извлекает и проверяет JWT из заголовка Authorization.
 * Если токена нет — пропускает дальше с req.user = undefined
 * (для публичных GET-маршрутов).
 */
export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, env.jwtSecret) as AuthPayload;
    } catch {
      // Игнорируем битый токен в optional-режиме.
    }
  }
  next();
}

/** Требует валидного пользователя. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new ApiError(401, 'Требуется авторизация');
  next();
}

/**
 * Ограничение по ролям (RBAC).
 * @example router.post('/', requireRole('editor','teip_admin'), ...)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new ApiError(401, 'Требуется авторизация');
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'Недостаточно прав');
    }
    next();
  };
}
