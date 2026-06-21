import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, ApiError } from '../../utils/http.js';
import { env } from '../../config/env.js';
import { verifyTurnstile } from './turnstile.js';
import * as service from './auth.service.js';

const registerSchema = z.object({
  display_name: z.string().min(2).max(120),
  phone: z.string().min(5).max(20).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Пароль не короче 8 символов'),
  turnstile_token: z.string().optional(),
}).refine((d) => d.phone || d.email, {
  message: 'Укажите телефон или e-mail',
});

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const captcha = await verifyTurnstile(input.turnstile_token);
  if (!captcha.ok) {
    throw new ApiError(400, 'Проверка на бота не пройдена. Обновите страницу и попробуйте снова.');
  }
  const result = await service.register(input);
  res.status(201).json(ok(result));
}

const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(1),
  turnstile_token: z.string().optional(),
});

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const captcha = await verifyTurnstile(input.turnstile_token);
  if (!captcha.ok) {
    throw new ApiError(400, 'Проверка на бота не пройдена. Обновите страницу и попробуйте снова.');
  }
  const result = await service.login(input);
  res.json(ok(result));
}

/** Публичная конфигурация для фронта (site key безопасно отдавать). */
export async function config(_req: Request, res: Response): Promise<void> {
  res.json(ok({ turnstile_site_key: env.turnstileSiteKey || null }));
}

const assignSchema = z.object({
  user_id: z.number().int().positive(),
  teip_id: z.number().int().positive(),
  village_id: z.number().int().positive().nullable().optional(),
});

export async function assignAdmin(req: Request, res: Response): Promise<void> {
  const input = assignSchema.parse(req.body);
  await service.assignAdmin(input);
  res.json(ok({ assigned: true }));
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json(ok({ user: req.user ?? null }));
}
