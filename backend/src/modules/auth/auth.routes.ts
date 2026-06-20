import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './auth.controller.js';

/** Префикс в app.ts: /api/auth */
export const authRouter = Router();

authRouter.post('/register', asyncHandler(controller.register));
authRouter.post('/login', asyncHandler(controller.login));
authRouter.get('/me', requireAuth, asyncHandler(controller.me));

// Назначение администратора тейпа — только супер-админ
authRouter.post(
  '/assign-admin',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.assignAdmin),
);
