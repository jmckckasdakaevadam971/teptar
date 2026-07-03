import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as controller from "./keepers.controller.js";

/**
 * Маршруты программы «Хранители тептара».
 * Префикс в app.ts: /api/keepers
 */
export const keepersRouter = Router();

// Публичный список хранителей (для страницы «Хранители»)
keepersRouter.get("/", asyncHandler(controller.list));

// Свой статус и подача заявки
keepersRouter.get("/my", requireAuth, asyncHandler(controller.my));
keepersRouter.post("/apply", requireAuth, asyncHandler(controller.apply));

// Рассмотрение заявок и управление тейпами модераторов — супер-админ
keepersRouter.get(
  "/applications",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(controller.applications),
);
keepersRouter.post(
  "/applications/:id/approve",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(controller.approve),
);
keepersRouter.post(
  "/applications/:id/reject",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(controller.reject),
);
keepersRouter.put(
  "/users/:id/teips",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(controller.setUserTeips),
);
