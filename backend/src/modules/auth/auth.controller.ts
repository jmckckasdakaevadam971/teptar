import type { Request, Response } from "express";
import { z } from "zod";
import { ok, ApiError } from "../../utils/http.js";
import { env } from "../../config/env.js";
import { verifyTurnstile } from "./turnstile.js";
import { emailVerificationEnabled } from "./mailer.js";
import * as service from "./auth.service.js";

const registerSchema = z
  .object({
    display_name: z
      .string()
      .min(2, "Имя не короче 2 символов")
      .max(120, "Имя слишком длинное"),
    phone: z
      .string()
      .min(5, "Некорректный телефон")
      .max(20, "Некорректный телефон")
      .optional(),
    email: z.string().email("Некорректный e-mail").optional(),
    password: z.string().min(8, "Пароль не короче 8 символов"),
    turnstile_token: z.string().optional(),
  })
  .refine((d) => d.phone || d.email, {
    message: "Укажите телефон или e-mail",
    path: ["phone"],
  });

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const captcha = await verifyTurnstile(input.turnstile_token);
  if (!captcha.ok) {
    throw new ApiError(
      400,
      "Проверка на бота не пройдена. Обновите страницу и попробуйте снова.",
    );
  }

  // Если включено подтверждение почты и регистрация идёт по e-mail —
  // отправляем код и ждём подтверждения (пользователь создастся на шаге verify).
  if (input.email && emailVerificationEnabled()) {
    const result = await service.requestEmailVerification({
      display_name: input.display_name,
      email: input.email,
      password: input.password,
    });
    res.status(202).json(ok(result));
    return;
  }

  const result = await service.register(input);
  res.status(201).json(ok(result));
}

const verifyEmailSchema = z.object({
  email: z.string().email("Некорректный e-mail"),
  code: z.string().min(4, "Введите код из письма").max(10, "Некорректный код"),
});

/** Шаг 2 регистрации: проверка кода из письма, создание аккаунта. */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const input = verifyEmailSchema.parse(req.body);
  const result = await service.verifyEmail(input);
  res.status(201).json(ok(result));
}

const resendSchema = z.object({
  display_name: z.string().min(2).max(120),
  email: z.string().email("Некорректный e-mail"),
  password: z.string().min(8),
});

/** Повторная отправка кода (те же данные регистрации). */
export async function resendCode(req: Request, res: Response): Promise<void> {
  const input = resendSchema.parse(req.body);
  const result = await service.requestEmailVerification(input);
  res.status(202).json(ok(result));
}

const loginSchema = z.object({
  login: z.string().min(3, "Введите телефон или e-mail"),
  password: z.string().min(1, "Введите пароль"),
  turnstile_token: z.string().optional(),
});

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const captcha = await verifyTurnstile(input.turnstile_token);
  if (!captcha.ok) {
    throw new ApiError(
      400,
      "Проверка на бота не пройдена. Обновите страницу и попробуйте снова.",
    );
  }
  const result = await service.login(input);
  res.json(ok(result));
}

/** Публичная конфигурация для фронта (site key безопасно отдавать). */
export async function config(_req: Request, res: Response): Promise<void> {
  res.json(
    ok({
      turnstile_site_key: env.turnstileSiteKey || null,
      email_verification: emailVerificationEnabled(),
    }),
  );
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

/** Полный профиль текущего пользователя из БД. */
export async function profile(req: Request, res: Response): Promise<void> {
  res.json(ok(await service.getProfile(req.user!.userId)));
}

const updateProfileSchema = z
  .object({
    display_name: z.string().min(2, "Имя не короче 2 символов").max(120),
    phone: z.string().min(5).max(20).nullable().optional(),
    email: z.string().email("Некорректный e-mail").nullable().optional(),
  })
  .refine((d) => Boolean(d.phone) || Boolean(d.email), {
    message: "Укажите телефон или e-mail",
  });

export async function updateProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const input = updateProfileSchema.parse(req.body);
  res.json(ok(await service.updateProfile(req.user!.userId, input)));
}

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Введите текущий пароль"),
  new_password: z.string().min(8, "Новый пароль не короче 8 символов"),
});

export async function changePassword(
  req: Request,
  res: Response,
): Promise<void> {
  const input = changePasswordSchema.parse(req.body);
  await service.changePassword(
    req.user!.userId,
    input.current_password,
    input.new_password,
  );
  res.json(ok({ changed: true }));
}
