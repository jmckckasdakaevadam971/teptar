-- ============================================================================
--  Миграция: программа «Хранители тептара»
--  Заявки на роль модератора-знатока тейпа.
--  Применение:  psql "$DATABASE_URL" -f migration_keepers.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS keeper_applications (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teip_id      BIGINT REFERENCES teips(id) ON DELETE SET NULL,
    teip_name    TEXT NOT NULL,                -- название тейпа текстом (если нет в справочнике)
    village      TEXT,                          -- село / район, историю которого знает заявитель
    experience   TEXT NOT NULL,                 -- откуда знания (рассказ заявителя)
    contact      TEXT,                          -- телефон / Telegram для связи
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
    resolved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keeper_apps_status ON keeper_applications(status);
CREATE INDEX IF NOT EXISTS idx_keeper_apps_user   ON keeper_applications(user_id);

-- Не больше одной заявки «на рассмотрении» на пользователя.
CREATE UNIQUE INDEX IF NOT EXISTS uq_keeper_apps_user_pending
    ON keeper_applications(user_id) WHERE status = 'pending';
