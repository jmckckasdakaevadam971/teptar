-- ============================================================================
--  Миграция: видимость древа (личное / общая база)
--  Применять на проде, где таблица persons уже существует.
--  Идемпотентна — можно запускать повторно.
-- ============================================================================

-- 1. Колонка видимости: по умолчанию личное древо (видит только владелец).
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

-- 2. Ограничение допустимых значений (добавляем, если ещё нет).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_visibility'
  ) THEN
    ALTER TABLE persons
      ADD CONSTRAINT chk_persons_visibility
      CHECK (visibility IN ('private','public'));
  END IF;
END $$;

-- 3. Приватные персоны не требуют модерации — дефолт статуса = approved.
ALTER TABLE persons ALTER COLUMN status SET DEFAULT 'approved';

-- 4. Индексы для фильтра общей базы и выборки своего древа.
CREATE INDEX IF NOT EXISTS idx_persons_created_by ON persons(created_by);
CREATE INDEX IF NOT EXISTS idx_persons_visibility ON persons(visibility, status);
