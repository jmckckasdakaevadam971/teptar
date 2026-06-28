import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import * as controller from './ancestors.controller.js';

/**
 * Маршруты деревьев и поиска общего предка.
 * Префикс в app.ts: /api/ancestors
 *
 * Примечание: маршруты предков/потомков конкретного человека также
 * доступны как вложенные, но для простоты держим их здесь.
 */
export const ancestorsRouter = Router();

// Примерное родство с другими древами (требует авторизацию)
ancestorsRouter.get('/related-trees', requireAuth, asyncHandler(controller.relatedTrees));

// Поиск общего предка двух людей: /api/ancestors/common?a=7&b=9
ancestorsRouter.get('/common', asyncHandler(controller.common));

// Дерево предков/потомков: /api/ancestors/:id/up  и  /:id/down
ancestorsRouter.get('/:id/up', asyncHandler(controller.ancestors));
ancestorsRouter.get('/:id/down', asyncHandler(controller.descendants));
