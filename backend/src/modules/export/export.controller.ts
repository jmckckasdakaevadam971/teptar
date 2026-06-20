import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/http.js';
import * as service from './export.service.js';

const paramsSchema = z.object({
  format: z.enum(['csv', 'visio', 'xlsx', 'pdf']).default('csv'),
  direction: z.enum(['down', 'up']).default('down'),
});

/**
 * Экспорт дерева человека в выбранном формате.
 * GET /api/export/tree/:id?format=csv|visio|xlsx|pdf&direction=down|up
 */
export async function exportTree(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { format, direction } = paramsSchema.parse(req.query);

  const rows =
    direction === 'down'
      ? await service.collectTree(id)
      : await service.collectLine(id);

  switch (format) {
    case 'csv': {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tree-${id}.csv"`);
      res.send(service.toCsv(rows));
      return;
    }
    case 'visio': {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tree-${id}-visio.csv"`);
      res.send(service.toVisioCsv(rows));
      return;
    }
    case 'xlsx': {
      // Требует установки exceljs. Реализация — в export.xlsx.ts (post-MVP).
      throw new ApiError(
        501,
        'XLSX-экспорт ещё не подключён. Установите exceljs и реализуйте export.xlsx.ts. ' +
          'Пока используйте format=csv (открывается в Excel).',
      );
    }
    case 'pdf': {
      // Требует Puppeteer (headless Chromium). Выносится в фоновую очередь.
      throw new ApiError(
        501,
        'PDF-экспорт ещё не подключён. Нужен Puppeteer. См. ROADMAP, этап 4.',
      );
    }
  }
}
