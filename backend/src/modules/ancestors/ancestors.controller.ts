import type { Request, Response } from "express";
import { z } from "zod";
import { ok } from "../../utils/http.js";
import * as service from "./ancestors.service.js";
import type { Viewer } from "./ancestors.service.js";

const depthSchema = z.coerce.number().int().min(1).max(30).default(20);

/** Зритель из запроса (видимость приватных древ). */
function viewerOf(req: Request): Viewer {
  return { userId: req.user?.userId ?? null, role: req.user?.role ?? null };
}

export async function ancestors(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const maxDepth = depthSchema.parse(req.query.depth ?? undefined);
  const data = await service.getAncestors(id, maxDepth, viewerOf(req));
  res.json(ok(data));
}

export async function descendants(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const maxDepth = depthSchema.parse(req.query.depth ?? undefined);
  const data = await service.getDescendants(id, maxDepth, viewerOf(req));
  res.json(ok(data));
}

export async function fullTree(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = await service.getFullTree(id, viewerOf(req));
  res.json(ok(data));
}

export async function mergedTree(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = await service.getMergedTree(id, viewerOf(req));
  res.json(ok(data));
}

const previewSchema = z.object({
  a: z.coerce.number().int().positive(),
  b: z.coerce.number().int().positive(),
});

/** Предпросмотр общего древа по паре якорей (только модератор). */
export async function mergedTreePreview(
  req: Request,
  res: Response,
): Promise<void> {
  const { a, b } = previewSchema.parse(req.query);
  const data = await service.getMergedTreePreview(a, b, viewerOf(req));
  res.json(ok(data));
}

const commonSchema = z.object({
  a: z.coerce.number().int().positive(),
  b: z.coerce.number().int().positive(),
});

export async function common(req: Request, res: Response): Promise<void> {
  const { a, b } = commonSchema.parse(req.query);
  const result = await service.findCommonAncestor(a, b, viewerOf(req));
  res.json(ok(result));
}

export async function relatedTrees(req: Request, res: Response): Promise<void> {
  const trees = await service.findRelatedTrees(req.user!.userId);
  res.json(ok(trees));
}
