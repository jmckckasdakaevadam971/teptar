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
  /** Тейп для назначения хранителем, если в профиле пользователя тейп не указан. */
  teip_id: z.coerce.number().int().positive().optional(),
});

/** PATCH /api/admin/users/:id/role — смена роли. */
export async function setRole(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { role, teip_id } = roleSchema.parse(req.body);
  await service.updateUserRole(id, role, req.user!.userId, teip_id ?? null);
  res.json(ok({ id, role }));
}

/** DELETE /api/admin/users/:id — удалить пользователя. */
export async function removeUser(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await service.deleteUser(id, req.user!.userId);
  res.json(ok({ deleted: true }));
}

/** GET /api/admin/trees — все опубликованные древа. */
export async function listTrees(_req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listPublishedTrees()));
}

/** POST /api/admin/trees/:ownerId/unpublish — снять древо с публикации. */
export async function unpublishTree(req: Request, res: Response): Promise<void> {
  const ownerId = Number(req.params.ownerId);
  res.json(ok(await service.unpublishOwnerTree(ownerId, req.user!.userId)));
}

/** DELETE /api/admin/trees/:ownerId — полностью удалить древо пользователя. */
export async function removeTree(req: Request, res: Response): Promise<void> {
  const ownerId = Number(req.params.ownerId);
  res.json(ok(await service.deleteOwnerTree(ownerId, req.user!.userId)));
}
