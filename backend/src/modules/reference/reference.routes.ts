import { Router } from 'express';
import { query } from '../../db/pool.js';
import { ok } from '../../utils/http.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Модуль «Справочник родовой иерархии».
 * Компактный — только чтение, поэтому всё в одном файле.
 * Монтируется в app.ts на префикс /api.
 *   GET /api/tukhums              — союзы тейпов + счётчик тейпов
 *   GET /api/tukhums/:id/teips    — тейпы конкретного тукхума
 *   GET /api/gars/:id/nekyi       — некъи (под-ветви) конкретного гара
 */
export const referenceRouter = Router();

interface TukhumRow {
  id: number;
  name: string;
  description: string | null;
  teip_count: number;
}

referenceRouter.get(
  '/tukhums',
  asyncHandler(async (_req, res) => {
    const rows = await query<TukhumRow>(
      `SELECT tk.id, tk.name, tk.description,
              count(t.id)::int AS teip_count
       FROM tukhums tk
       LEFT JOIN teips t ON t.tukhum_id = tk.id
       GROUP BY tk.id
       ORDER BY tk.name`,
    );
    res.json(ok(rows));
  }),
);

referenceRouter.get(
  '/tukhums/:id/teips',
  asyncHandler(async (req, res) => {
    const rows = await query(
      'SELECT * FROM teips WHERE tukhum_id = $1 ORDER BY name',
      [Number(req.params.id)],
    );
    res.json(ok(rows));
  }),
);

referenceRouter.get(
  '/gars/:id/nekyi',
  asyncHandler(async (req, res) => {
    const rows = await query(
      'SELECT * FROM nekyi WHERE gar_id = $1 ORDER BY name',
      [Number(req.params.id)],
    );
    res.json(ok(rows));
  }),
);
