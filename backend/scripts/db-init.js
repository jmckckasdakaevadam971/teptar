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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, "..", "src", "db");

const SEED_DEMO = process.env.SEED_DEMO === "1";
const FORCE_RESET = process.env.FORCE_RESET === "1";

function sql(file) {
  return readFileSync(join(dbDir, file), "utf8");
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL не задан. Скопируйте .env.example → .env");
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

    // Лёгкие идемпотентные миграции — выполняются ДО reference_data.sql,
    // потому что там есть UPDATE по новым колонкам (напр. teips.origin_*).
    if (initialized) {
      await client.query(
        `ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_diff JSONB;
         ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_by BIGINT;
         ALTER TABLE persons ADD COLUMN IF NOT EXISTS pending_at TIMESTAMPTZ;
         ALTER TABLE users   ADD COLUMN IF NOT EXISTS root_person_id BIGINT;
         ALTER TABLE users   ADD COLUMN IF NOT EXISTS teip_id BIGINT REFERENCES teips(id) ON DELETE SET NULL;
         ALTER TABLE users   ADD COLUMN IF NOT EXISTS village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL;
         ALTER TABLE teips   ADD COLUMN IF NOT EXISTS origin_place TEXT;
         ALTER TABLE teips   ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
         ALTER TABLE teips   ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;
         ALTER TABLE tukhums ADD COLUMN IF NOT EXISTS approx_lat DOUBLE PRECISION;
         ALTER TABLE tukhums ADD COLUMN IF NOT EXISTS approx_lng DOUBLE PRECISION;
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

      // Коды подтверждения e-mail при регистрации (создаётся, если ещё нет).
      await client.query(
        `CREATE TABLE IF NOT EXISTS email_verifications (
           id            BIGSERIAL PRIMARY KEY,
           email         TEXT NOT NULL,
           code          TEXT NOT NULL,
           display_name  TEXT NOT NULL,
           password_hash TEXT NOT NULL,
           attempts      INT  NOT NULL DEFAULT 0,
           expires_at    TIMESTAMPTZ NOT NULL,
           created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         CREATE UNIQUE INDEX IF NOT EXISTS uq_email_verif_email ON email_verifications(email);
         ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS teip_id BIGINT REFERENCES teips(id) ON DELETE SET NULL;
         ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS teip_name TEXT;
         ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL;`,
      );

      // Открытый справочник тейпов: алиасы (варианты написания) и заявки
      // на добавление тейпа (создаются при регистрации с неизвестным тейпом).
      await client.query(
        `CREATE TABLE IF NOT EXISTS teip_aliases (
           id         BIGSERIAL PRIMARY KEY,
           teip_id    BIGINT NOT NULL REFERENCES teips(id) ON DELETE CASCADE,
           name       TEXT NOT NULL UNIQUE,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         CREATE INDEX IF NOT EXISTS idx_teip_aliases_teip ON teip_aliases(teip_id);
         CREATE TABLE IF NOT EXISTS teip_requests (
           id               BIGSERIAL PRIMARY KEY,
           name             TEXT NOT NULL,
           requested_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
           status           TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','mapped','rejected')),
           resolved_teip_id BIGINT REFERENCES teips(id) ON DELETE SET NULL,
           resolved_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
           resolved_at      TIMESTAMPTZ,
           created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         CREATE INDEX IF NOT EXISTS idx_teip_requests_status ON teip_requests(status);`,
      );

      // Очередь предложений объединения древ (создаётся, если ещё нет).
      await client.query(
        `CREATE TABLE IF NOT EXISTS merge_suggestions (
           id           BIGSERIAL PRIMARY KEY,
           person_a_id  BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
           person_b_id  BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
           similarity   REAL   NOT NULL DEFAULT 0,
           status       TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','merged','dismissed')),
           resolved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
           resolved_at  TIMESTAMPTZ,
           created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
           CONSTRAINT chk_ms_order CHECK (person_a_id < person_b_id)
         );
         CREATE UNIQUE INDEX IF NOT EXISTS uq_merge_pair    ON merge_suggestions(person_a_id, person_b_id);
         CREATE INDEX        IF NOT EXISTS idx_merge_status ON merge_suggestions(status);`,
      );

      // Объединённые древа (неразрушительное слияние по общему предку).
      await client.query(
        `CREATE TABLE IF NOT EXISTS tree_merges (
           id                BIGSERIAL PRIMARY KEY,
           anchor_a_id       BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
           anchor_b_id       BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
           merged_name       TEXT,
           merged_birth_year INT,
           merged_death_year INT,
           merged_note       TEXT,
           status            TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','approved','rejected')),
           proposed_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
           approved_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
           created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
           resolved_at       TIMESTAMPTZ,
           CONSTRAINT chk_tm_order CHECK (anchor_a_id < anchor_b_id)
         );
         CREATE UNIQUE INDEX IF NOT EXISTS uq_tree_merge_pair  ON tree_merges(anchor_a_id, anchor_b_id);
         CREATE INDEX        IF NOT EXISTS idx_tree_merge_stat ON tree_merges(status);`,
      );

      // Запросы доступа к ветви родословной (создаётся, если ещё нет).
      await client.query(
        `CREATE TABLE IF NOT EXISTS branch_access_requests (
           id             BIGSERIAL PRIMARY KEY,
           requester_id   BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
           owner_id       BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
           branch_root_id BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
           comment        TEXT,
           status         TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),
           resolved_at    TIMESTAMPTZ,
           created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         CREATE INDEX IF NOT EXISTS idx_bar_owner     ON branch_access_requests(owner_id, status);
         CREATE INDEX IF NOT EXISTS idx_bar_requester ON branch_access_requests(requester_id, status);
         CREATE UNIQUE INDEX IF NOT EXISTS uq_bar_active
             ON branch_access_requests(requester_id, branch_root_id)
             WHERE status IN ('pending','approved');`,
      );

      // Черновики «Моего древа» — синхронизация редактора между устройствами.
      await client.query(
        `CREATE TABLE IF NOT EXISTS tree_drafts (
           user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
           data        JSONB NOT NULL DEFAULT '[]'::jsonb,
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
         );`,
      );
    }

    if (FORCE_RESET || !initialized) {
      if (FORCE_RESET && initialized) {
        console.log(
          "→ FORCE_RESET=1 — пересоздаю схему (данные будут стёрты)…",
        );
      } else {
        console.log("→ Первый запуск — создаю схему…");
      }
      console.log("→ Применяю schema.sql …");
      await client.query(sql("schema.sql"));

      if (SEED_DEMO) {
        console.log("→ SEED_DEMO=1 → загружаю seed.sql (демо-данные) …");
        await client.query(sql("seed.sql"));
      } else {
        console.log("→ Демо-данные пропущены (SEED_DEMO≠1).");
      }

      console.log("→ Загружаю reference_data.sql (справочник ЧР) …");
      await client.query(sql("reference_data.sql"));

      console.log("✅ База данных инициализирована.");
    } else {
      // Обновление существующей базы: только идемпотентный справочник.
      console.log("→ База уже инициализирована — обновляю только справочник…");
      console.log("→ Применяю reference_data.sql (идемпотентно) …");
      await client.query(sql("reference_data.sql"));
      console.log("✅ Справочник обновлён, пользовательские данные сохранены.");
    }
  } catch (err) {
    console.error("❌ Ошибка инициализации:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
