import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as controller from './export.controller.js';

/** Префикс в app.ts: /api/export */
export const exportRouter = Router();

exportRouter.get('/tree/:id', asyncHandler(controller.exportTree));
