import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../utils/http.js';
import * as service from './ancestors.service.js';

const depthSchema = z.coerce.number().int().min(1).max(30).default(20);

export async function ancestors(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const maxDepth = depthSchema.parse(req.query.depth ?? undefined);
  const data = await service.getAncestors(id, maxDepth);
  res.json(ok(data));
}

export async function descendants(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const maxDepth = depthSchema.parse(req.query.depth ?? undefined);
  const data = await service.getDescendants(id, maxDepth);
  res.json(ok(data));
}

const commonSchema = z.object({
  a: z.coerce.number().int().positive(),
  b: z.coerce.number().int().positive(),
});

export async function common(req: Request, res: Response): Promise<void> {
  const { a, b } = commonSchema.parse(req.query);
  const result = await service.findCommonAncestor(a, b);
  res.json(ok(result));
}
