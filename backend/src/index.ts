import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

async function main() {
  // Проверяем доступность БД до старта приёма запросов.
  try {
    await pool.query('SELECT 1');
    console.log('[db] соединение установлено');
  } catch (err) {
    console.error('[db] не удалось подключиться к PostgreSQL:', err);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[teptar] API запущен на http://localhost:${env.port}`);
  });
}

main();
