import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import * as controller from "./auth.controller.js";

/** Префикс в app.ts: /api/auth */
export const authRouter = Router();

// Защита от брутфорса: 10 попыток входа/регистрации в минуту с одного IP.
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

authRouter.post("/register", authLimiter, asyncHandler(controller.register));
authRouter.post("/login", authLimiter, asyncHandler(controller.login));
authRouter.post(
  "/verify-email",
  authLimiter,
  asyncHandler(controller.verifyEmail),
);
authRouter.post(
  "/resend-code",
  authLimiter,
  asyncHandler(controller.resendCode),
);
authRouter.get("/config", asyncHandler(controller.config));
authRouter.get("/me", requireAuth, asyncHandler(controller.me));
authRouter.get("/profile", requireAuth, asyncHandler(controller.profile));
authRouter.patch(
  "/profile",
  requireAuth,
  asyncHandler(controller.updateProfile),
);
authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(controller.changePassword),
);

// Назначение администратора тейпа — только супер-админ
authRouter.post(
  "/assign-admin",
  requireAuth,
  requireRole("super_admin"),
  asyncHandler(controller.assignAdmin),
);
