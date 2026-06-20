import pg from 'pg';
import { env } from '../config/env.js';

/**
 * Единый пул соединений PostgreSQL на всё приложение.
 * Импортируйте { query, pool } в сервисах модулей.
 */
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Ошибка простаивающего клиента — логируем, но не роняем процесс.
  console.error('[db] неожиданная ошибка пула:', err);
});

/**
 * Типобезопасная обёртка над pool.query.
 * @example const rows = await query<Person>('SELECT * FROM persons WHERE id=$1', [id]);
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

/**
 * Выполнить набор операций в одной транзакции.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
