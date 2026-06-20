import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { ok } from '../../utils/http.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

/**
 * Модуль «Сёла». Компактный — справочник без сложной логики,
 * поэтому держим routes/controller/service в одном файле.
 * Префикс в app.ts: /api/villages
 */
export const villagesRouter = Router();

interface VillageRow {
  id: number;
  name: string;
  district: string | null;
}

villagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? `%${req.query.q}%` : '%';
    const rows = await query<VillageRow>(
      'SELECT * FROM villages WHERE name ILIKE $1 ORDER BY name',
      [q],
    );
    res.json(ok(rows));
  }),
);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  district: z.string().max(120).nullable().optional(),
});

villagesRouter.post(
  '/',
  requireAuth,
  requireRole('teip_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const rows = await query<VillageRow>(
      'INSERT INTO villages (name, district) VALUES ($1,$2) RETURNING *',
      [input.name, input.district ?? null],
    );
    res.status(201).json(ok(rows[0]));
  }),
);
