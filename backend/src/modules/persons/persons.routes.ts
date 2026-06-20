import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './persons.controller.js';

/**
 * Маршруты модуля «Персоны».
 * Базовый префикс монтируется в app.ts: /api/persons
 */
export const personsRouter = Router();

// Публичное чтение
personsRouter.get('/', asyncHandler(controller.list));
personsRouter.get('/:id', asyncHandler(controller.getById));

// Изменения — только авторизованным
personsRouter.post('/', requireAuth, asyncHandler(controller.create));
personsRouter.patch('/:id', requireAuth, asyncHandler(controller.update));

// Удаление — только админам
personsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.remove),
);
