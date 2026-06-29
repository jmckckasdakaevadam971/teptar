import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './persons.controller.js';

/**
 * Маршруты модуля «Персоны».
 * Базовый префикс монтируется в app.ts: /api/persons
 */
export const personsRouter = Router();

// Публичное чтение (с учётом видимости)
personsRouter.get('/', asyncHandler(controller.list));

// Публичный каталог опубликованных древ
personsRouter.get('/trees/public', asyncHandler(controller.publicTrees));

// Своё древо: статус и публикация в общую базу
personsRouter.get('/tree/status', requireAuth, asyncHandler(controller.treeStatus));
personsRouter.post('/tree/publish', requireAuth, asyncHandler(controller.publish));
personsRouter.post('/tree/unpublish', requireAuth, asyncHandler(controller.unpublish));

// Модерация общей базы (админы тейпа и супер-админ)
personsRouter.get(
  '/moderation/pending',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.pending),
);
personsRouter.get(
  '/moderation/edits',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.editOwners),
);
personsRouter.get(
  '/moderation/:ownerId/persons',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.pendingPersons),
);
personsRouter.post(
  '/moderation/:ownerId/approve',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.approve),
);
personsRouter.post(
  '/moderation/:ownerId/reject',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.reject),
);
personsRouter.get(
  '/moderation/:ownerId/duplicates',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.duplicates),
);
personsRouter.get(
  '/moderation/:ownerId/changes',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.changes),
);
personsRouter.post(
  '/moderation/edit/:id/approve',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.approveEdit),
);
personsRouter.post(
  '/moderation/edit/:id/reject',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.rejectEdit),
);
personsRouter.post(
  '/moderation/merge',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(controller.merge),
);

// Одна персона
personsRouter.get('/:id', asyncHandler(controller.getById));
personsRouter.get('/:id/family', asyncHandler(controller.family));

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
