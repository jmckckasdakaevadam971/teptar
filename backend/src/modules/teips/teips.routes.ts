import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './teips.controller.js';

/** Префикс в app.ts: /api/teips */
export const teipsRouter = Router();

teipsRouter.get('/', asyncHandler(controller.list));

// Заявки на добавление тейпа — только супер-админ.
// ВАЖНО: маршруты /requests должны стоять ДО catch-all '/:id'.
teipsRouter.get(
  '/requests',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.requests),
);
teipsRouter.post(
  '/requests/:id/approve',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.approveRequest),
);
teipsRouter.post(
  '/requests/:id/map',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.mapRequest),
);
teipsRouter.post(
  '/requests/:id/reject',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.rejectRequest),
);

// Варианты написания тейпа (алиасы) — только супер-админ.
teipsRouter.delete(
  '/aliases/:aliasId',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.removeAlias),
);
teipsRouter.post(
  '/:id/aliases',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.addAlias),
);

// Исторические личности тейпа: читают все, редактирует супер-админ.
teipsRouter.patch(
  '/notables/:notableId',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.updateNotable),
);
teipsRouter.delete(
  '/notables/:notableId',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.removeNotable),
);
teipsRouter.get('/:id/notables', asyncHandler(controller.notables));
teipsRouter.post(
  '/:id/notables',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.addNotable),
);

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

// Редактирование справочника: название/описание/тукхум и удаление тейпа
teipsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.update),
);
teipsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(controller.remove),
);
