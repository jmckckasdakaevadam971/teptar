import type { Request, Response } from "express";
import { z } from "zod";
import { ok } from "../../utils/http.js";
import { ApiError } from "../../utils/http.js";
import * as service from "./teips.service.js";

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listTeips()));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const teip = await service.getTeip(Number(req.params.id));
  if (!teip) throw new ApiError(404, "Тейп не найден");
  const stats = await service.teipStats(teip.id);
  res.json(ok({ ...teip, stats }));
}

export async function gars(req: Request, res: Response): Promise<void> {
  res.json(ok(await service.listGars(Number(req.params.id))));
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  tukhum_id: z.number().int().positive().nullable().optional(),
});

export async function create(req: Request, res: Response): Promise<void> {
  const input = createSchema.parse(req.body);
  const teip = await service.createTeip(
    input.name,
    input.description ?? null,
    input.tukhum_id ?? null,
  );
  res.status(201).json(ok(teip));
}

const originSchema = z.object({
  origin_place: z.string().max(200).nullable().optional(),
  origin_lat: z.number().min(-90).max(90).nullable().optional(),
  origin_lng: z.number().min(-180).max(180).nullable().optional(),
});

export async function updateOrigin(req: Request, res: Response): Promise<void> {
  const input = originSchema.parse(req.body);
  const teip = await service.updateTeipOrigin(Number(req.params.id), {
    origin_place: input.origin_place ?? null,
    origin_lat: input.origin_lat ?? null,
    origin_lng: input.origin_lng ?? null,
  });
  if (!teip) throw new ApiError(404, "Тейп не найден");
  res.json(ok(teip));
}
