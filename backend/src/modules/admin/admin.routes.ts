import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './admin.controller.js';

/**
 * Префикс в app.ts: /api/admin
 * Все маршруты доступны только супер-администратору.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('super_admin'));

adminRouter.get('/stats', asyncHandler(controller.stats));
adminRouter.get('/users', asyncHandler(controller.listUsers));
adminRouter.patch('/users/:id/role', asyncHandler(controller.setRole));
adminRouter.delete('/users/:id', asyncHandler(controller.removeUser));
