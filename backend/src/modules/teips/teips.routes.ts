import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './teips.controller.js';

/** Префикс в app.ts: /api/teips */
export const teipsRouter = Router();

teipsRouter.get('/', asyncHandler(controller.list));
teipsRouter.get('/:id', asyncHandler(controller.getById));
teipsRouter.get('/:id/gars', asyncHandler(controller.gars));

// Создавать справочник тейпов может только супер-админ
teipsRouter.post(
  '/',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.create),
);

// Редактировать место основания (для метки на карте) — тоже супер-админ
teipsRouter.patch(
  '/:id/origin',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.updateOrigin),
);
