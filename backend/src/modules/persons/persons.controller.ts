import type { Request, Response } from 'express';
import { ok } from '../../utils/http.js';
import {
  createPersonSchema,
  updatePersonSchema,
  listPersonsSchema,
} from './persons.types.js';
import * as service from './persons.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const params = listPersonsSchema.parse(req.query);
  const persons = await service.listPersons(params);
  res.json(ok(persons, { limit: params.limit, offset: params.offset }));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const person = await service.getPerson(Number(req.params.id));
  res.json(ok(person));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createPersonSchema.parse(req.body);
  // Админы создают сразу approved, остальные — pending на модерацию.
  const role = req.user?.role;
  const autoApprove = role === 'teip_admin' || role === 'super_admin';
  const person = await service.createPerson(input, req.user?.userId ?? null, autoApprove);
  res.status(201).json(ok(person));
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updatePersonSchema.parse(req.body);
  const person = await service.updatePerson(
    Number(req.params.id),
    input,
    req.user?.userId ?? null,
  );
  res.json(ok(person));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deletePerson(Number(req.params.id));
  res.status(204).end();
}
