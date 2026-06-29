// Безопасная инициализация / миграция БД.
// Запуск:  node scripts/db-init.js   (или npm run db:init)
// Требует переменную окружения DATABASE_URL (см. .env).
//
// Логика (чтобы повторные деплои НЕ стирали данные на проде):
//   • Первый запуск (таблицы ещё нет) → schema.sql + reference_data.sql,
//     и демо-данные seed.sql ТОЛЬКО если SEED_DEMO=1.
//   • Последующие запуски (таблицы есть) → применяется только
//     reference_data.sql (он идемпотентен, ON CONFLICT DO NOTHING) —
//     пользовательские данные не трогаются.
//   • FORCE_RESET=1 → принудительно пересоздать схему (ОПАСНО: стирает всё).
//
// Такой скрипт безопасно выполнять при каждом старте контейнера.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'src', 'db');

const SEED_DEMO = process.env.SEED_DEMO === '1';
const FORCE_RESET = process.env.FORCE_RESET === '1';

function sql(file) {
  return readFileSync(join(dbDir, file), 'utf8');
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL не задан. Скопируйте .env.example → .env');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Уже инициализирована? Проверяем наличие ключевой таблицы persons.
    const { rows } = await client.query(
      "SELECT to_regclass('public.persons') AS t",
    );
    const initialized = rows[0].t !== null;

    if (FORCE_RESET || !initialized) {
      if (FORCE_RESET && initialized) {
        console.log('→ FORCE_RESET=1 — пересоздаю схему (данные будут стёрты)…');
      } else {
        console.log('→ Первый запуск — создаю схему…');
      }
      console.log('→ Применяю schema.sql …');
      await client.query(sql('schema.sql'));

      if (SEED_DEMO) {
        console.log('→ SEED_DEMO=1 → загружаю seed.sql (демо-данные) …');
        await client.query(sql('seed.sql'));
      } else {
        console.log('→ Демо-данные пропущены (SEED_DEMO≠1).');
      }

      console.log('→ Загружаю reference_data.sql (справочник ЧР) …');
      await client.query(sql('reference_data.sql'));

      console.log('✅ База данных инициализирована.');
    } else {
      // Обновление существующей базы: только идемпотентный справочник.
      console.log('→ База уже инициализирована — обновляю только справочник…');
      console.log('→ Применяю reference_data.sql (идемпотентно) …');
      await client.query(sql('reference_data.sql'));
      console.log('✅ Справочник обновлён, пользовательские данные сохранены.');
    }

    // Лёгкие идемпотентные миграции (безопасны при каждом старте).
    await client.query(
      `ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_diff JSONB;
       ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_by BIGINT;
       ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_at TIMESTAMPTZ;
       ALTER TABLE users   ADD COLUMN IF NOT EXISTS root_person_id BIGINT;
       DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_root_person'
         ) THEN
           ALTER TABLE users
             ADD CONSTRAINT fk_users_root_person
             FOREIGN KEY (root_person_id) REFERENCES persons(id) ON DELETE SET NULL;
         END IF;
       END $$;`,
    );
  } catch (err) {
    console.error('❌ Ошибка инициализации:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
