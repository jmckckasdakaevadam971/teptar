import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { ok } from '../../utils/http.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Модуль «Связи» — браки (marriages).
 * Связи родитель→ребёнок живут прямо в persons, поэтому здесь только браки.
 * Префикс в app.ts: /api/relations
 */
export const relationsRouter = Router();

interface MarriageRow {
  id: number;
  husband_id: number;
  wife_id: number;
  start_year: number | null;
  end_year: number | null;
  note: string | null;
}

// Браки конкретного человека (как мужа или жены)
relationsRouter.get(
  '/marriages/:personId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.personId);
    const rows = await query<MarriageRow>(
      'SELECT * FROM marriages WHERE husband_id = $1 OR wife_id = $1',
      [id],
    );
    res.json(ok(rows));
  }),
);

const createSchema = z.object({
  husband_id: z.number().int().positive(),
  wife_id: z.number().int().positive(),
  start_year: z.number().int().nullable().optional(),
  end_year: z.number().int().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

relationsRouter.post(
  '/marriages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const rows = await query<MarriageRow>(
      `INSERT INTO marriages (husband_id, wife_id, start_year, end_year, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        input.husband_id,
        input.wife_id,
        input.start_year ?? null,
        input.end_year ?? null,
        input.note ?? null,
      ],
    );
    res.status(201).json(ok(rows[0]));
  }),
);
