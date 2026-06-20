import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { authOptional } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

// Маршруты модулей
import { personsRouter } from './modules/persons/persons.routes.js';
import { relationsRouter } from './modules/relations/relations.routes.js';
import { teipsRouter } from './modules/teips/teips.routes.js';
import { villagesRouter } from './modules/villages/villages.routes.js';
import { ancestorsRouter } from './modules/ancestors/ancestors.routes.js';
import { exportRouter } from './modules/export/export.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { referenceRouter } from './modules/reference/reference.routes.js';

/**
 * Собирает Express-приложение. Вынесено отдельно от index.ts,
 * чтобы можно было импортировать app в тестах без запуска listen().
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(authOptional); // распознаём пользователя, если есть токен

  // Health-check
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, service: 'teptar-backend', ts: Date.now() });
  });

  // Монтаж модулей — каждый в своём префиксе
  app.use('/api/persons', personsRouter);
  app.use('/api/relations', relationsRouter);
  app.use('/api/teips', teipsRouter);
  app.use('/api/villages', villagesRouter);
  app.use('/api/ancestors', ancestorsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', referenceRouter);

  // Обработчики «в конце»
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
