import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import * as controller from "./branch-access.controller.js";

/**
 * Запросы доступа к ветви родословной.
 * Префикс в app.ts: /api/branch-access
 */
export const branchAccessRouter = Router();

// Создать запрос (любой зарегистрированный пользователь)
branchAccessRouter.post("/", requireAuth, asyncHandler(controller.create));

// Входящие запросы владельцу и мои исходящие
branchAccessRouter.get(
  "/incoming",
  requireAuth,
  asyncHandler(controller.incoming),
);
branchAccessRouter.get("/mine", requireAuth, asyncHandler(controller.mine));

// Решение владельца
branchAccessRouter.post(
  "/:id/approve",
  requireAuth,
  asyncHandler(controller.approve),
);
branchAccessRouter.post(
  "/:id/reject",
  requireAuth,
  asyncHandler(controller.reject),
);

// Мои права на конкретном древе (владелец / одобренные ветви)
branchAccessRouter.get(
  "/my-grant/:rootId",
  requireAuth,
  asyncHandler(controller.myGrant),
);
