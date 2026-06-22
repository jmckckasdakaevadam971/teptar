import type { Request, Response } from 'express';
import { ok } from '../../utils/http.js';
import {
  createPersonSchema,
  updatePersonSchema,
  listPersonsSchema,
  publishTreeSchema,
} from './persons.types.js';
import * as service from './persons.service.js';
import type { Viewer } from './persons.service.js';

/** Извлечь зрителя из запроса (для контроля видимости). */
function viewerOf(req: Request): Viewer {
  return { userId: req.user?.userId ?? null, role: req.user?.role ?? null };
}

export async function list(req: Request, res: Response): Promise<void> {
  const params = listPersonsSchema.parse(req.query);
  const persons = await service.listPersons(params, viewerOf(req));
  res.json(ok(persons, { limit: params.limit, offset: params.offset }));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const person = await service.getPerson(Number(req.params.id), viewerOf(req));
  res.json(ok(person));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createPersonSchema.parse(req.body);
  const person = await service.createPerson(input, req.user!.userId);
  res.status(201).json(ok(person));
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updatePersonSchema.parse(req.body);
  const person = await service.updatePerson(Number(req.params.id), input, viewerOf(req));
  res.json(ok(person));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deletePerson(Number(req.params.id));
  res.status(204).end();
}

// ── Публикация своего древа ──────────────────────────────────────────────

export async function treeStatus(req: Request, res: Response): Promise<void> {
  const status = await service.getTreeStatus(req.user!.userId);
  res.json(ok(status));
}

export async function publish(req: Request, res: Response): Promise<void> {
  const { mode, cutoff_year } = publishTreeSchema.parse(req.body);
  const result = await service.publishTree(req.user!.userId, mode, cutoff_year);
  res.json(ok(result));
}

export async function unpublish(req: Request, res: Response): Promise<void> {
  const result = await service.unpublishTree(req.user!.userId);
  res.json(ok(result));
}

// ── Модерация (teip_admin / super_admin) ─────────────────────────────────

export async function pending(_req: Request, res: Response): Promise<void> {
  const trees = await service.listPendingTrees();
  res.json(ok(trees));
}

export async function pendingPersons(req: Request, res: Response): Promise<void> {
  const persons = await service.getPendingPersons(Number(req.params.ownerId));
  res.json(ok(persons));
}

export async function approve(req: Request, res: Response): Promise<void> {
  const result = await service.approveTree(Number(req.params.ownerId), req.user!.userId);
  res.json(ok(result));
}

export async function reject(req: Request, res: Response): Promise<void> {
  const result = await service.rejectTree(Number(req.params.ownerId), req.user!.userId);
  res.json(ok(result));
}
