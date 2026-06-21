import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../utils/http.js';
import * as service from './admin.service.js';

/** GET /api/admin/stats — сводные счётчики. */
export async function stats(_req: Request, res: Response): Promise<void> {
  res.json(ok(await service.getStats()));
}

/** GET /api/admin/users — список всех пользователей. */
export async function listUsers(_req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listUsers()));
}

const roleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'teip_admin', 'super_admin']),
});

/** PATCH /api/admin/users/:id/role — смена роли. */
export async function setRole(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { role } = roleSchema.parse(req.body);
  await service.updateUserRole(id, role, req.user!.userId);
  res.json(ok({ id, role }));
}

/** DELETE /api/admin/users/:id — удалить пользователя. */
export async function removeUser(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await service.deleteUser(id, req.user!.userId);
  res.json(ok({ deleted: true }));
}
