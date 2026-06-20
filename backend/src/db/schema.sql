-- ============================================================================
--  Тептар — схема базы данных (PostgreSQL 14+)
--  Генеалогическое древо чеченских тейпов.
--  Применение:  psql "$DATABASE_URL" -f schema.sql
-- ============================================================================

-- Расширения --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- нечёткий поиск по ФИО

-- Для чистого пересоздания при разработке (ОСТОРОЖНО на проде!) ------------
DROP TABLE IF EXISTS change_log        CASCADE;
DROP TABLE IF EXISTS admin_assignments CASCADE;
DROP TABLE IF EXISTS marriages         CASCADE;
DROP TABLE IF EXISTS persons           CASCADE;
DROP TABLE IF EXISTS nekyi             CASCADE;
DROP TABLE IF EXISTS gars              CASCADE;
DROP TABLE IF EXISTS teips             CASCADE;
DROP TABLE IF EXISTS tukhums           CASCADE;
DROP TABLE IF EXISTS villages          CASCADE;
DROP TABLE IF EXISTS users             CASCADE;

-- ============================================================================
--  СПРАВОЧНИКИ РОДОВОЙ ИЕРАРХИИ
-- ============================================================================

-- Тукхум — союз тейпов (опционально)
CREATE TABLE tukhums (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Тейп (клан) — базовая единица принадлежности
CREATE TABLE teips (
    id          BIGSERIAL PRIMARY KEY,
    tukhum_id   BIGINT REFERENCES tukhums(id) ON DELETE SET NULL,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Гар — ветвь внутри тейпа (опционально)
CREATE TABLE gars (
    id          BIGSERIAL PRIMARY KEY,
    teip_id     BIGINT NOT NULL REFERENCES teips(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    UNIQUE (teip_id, name)
);

-- Некъи — под-ветвь («род по прямой линии») внутри гара
CREATE TABLE nekyi (
    id          BIGSERIAL PRIMARY KEY,
    gar_id      BIGINT NOT NULL REFERENCES gars(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    UNIQUE (gar_id, name)
);

-- Населённые пункты
CREATE TABLE villages (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    district    TEXT,                                       -- район / историческая область
    type        TEXT,                                       -- город | село | станица | аул | хутор
    is_extant   BOOLEAN NOT NULL DEFAULT TRUE,              -- FALSE = нежилое/исчезнувшее
    note        TEXT,                                       -- примечание (напр. «разрушено в 1944»)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, district)
);

-- ============================================================================
--  ПОЛЬЗОВАТЕЛИ И РОЛИ
-- ============================================================================

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    display_name  TEXT NOT NULL,
    phone         TEXT UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('viewer','editor','teip_admin','super_admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  ЯДРО — ПЕРСОНЫ
-- ============================================================================

CREATE TABLE persons (
    id          BIGSERIAL PRIMARY KEY,
    full_name   TEXT NOT NULL,                              -- ФИО
    gender      CHAR(1) NOT NULL DEFAULT 'm'
                CHECK (gender IN ('m','f')),
    birth_year  INT,                                        -- год рождения
    death_year  INT,                                        -- год смерти (NULL = неизв.)
    is_alive    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Прямые связи (мужская линия — основа обхода дерева)
    father_id   BIGINT REFERENCES persons(id) ON DELETE SET NULL,
    mother_id   BIGINT REFERENCES persons(id) ON DELETE SET NULL,

    -- Принадлежность
    teip_id     BIGINT REFERENCES teips(id)    ON DELETE SET NULL,
    gar_id      BIGINT REFERENCES gars(id)     ON DELETE SET NULL,
    village_id  BIGINT REFERENCES villages(id) ON DELETE SET NULL,

    note        TEXT,                                       -- примечание

    -- Модерация
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Базовая валидация годов
    CONSTRAINT chk_years CHECK (
        death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year
    ),
    -- Человек не может быть сам себе родителем
    CONSTRAINT chk_not_self_parent CHECK (
        id IS DISTINCT FROM father_id AND id IS DISTINCT FROM mother_id
    )
);

-- ============================================================================
--  БРАКИ (отдельная связь «многие-ко-многим»)
-- ============================================================================

CREATE TABLE marriages (
    id          BIGSERIAL PRIMARY KEY,
    husband_id  BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    wife_id     BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    start_year  INT,
    end_year    INT,
    note        TEXT,
    UNIQUE (husband_id, wife_id),
    CONSTRAINT chk_diff_spouses CHECK (husband_id <> wife_id)
);

-- ============================================================================
--  МОДЕРАЦИЯ: ПРИВЯЗКА АДМИНОВ ТЕЙПА К СЁЛАМ
-- ============================================================================

CREATE TABLE admin_assignments (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    teip_id     BIGINT NOT NULL REFERENCES teips(id)    ON DELETE CASCADE,
    village_id  BIGINT REFERENCES villages(id)          ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, teip_id, village_id)
);

-- ============================================================================
--  ЖУРНАЛ ИЗМЕНЕНИЙ (аудит и разрешение споров)
-- ============================================================================

CREATE TABLE change_log (
    id          BIGSERIAL PRIMARY KEY,
    person_id   BIGINT REFERENCES persons(id) ON DELETE CASCADE,
    user_id     BIGINT REFERENCES users(id)   ON DELETE SET NULL,
    action      TEXT NOT NULL,                 -- create | update | approve | reject | merge
    diff        JSONB,                         -- что именно изменилось
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  ИНДЕКСЫ
-- ============================================================================

CREATE INDEX idx_persons_father    ON persons(father_id);
CREATE INDEX idx_persons_mother    ON persons(mother_id);
CREATE INDEX idx_persons_teip      ON persons(teip_id);
CREATE INDEX idx_persons_village   ON persons(village_id);
CREATE INDEX idx_persons_status    ON persons(status);
CREATE INDEX idx_persons_name_trgm ON persons USING gin (full_name gin_trgm_ops);

CREATE INDEX idx_marriages_husband ON marriages(husband_id);
CREATE INDEX idx_marriages_wife    ON marriages(wife_id);
CREATE INDEX idx_changelog_person  ON change_log(person_id);

CREATE INDEX idx_teips_tukhum      ON teips(tukhum_id);
CREATE INDEX idx_gars_teip         ON gars(teip_id);
CREATE INDEX idx_nekyi_gar         ON nekyi(gar_id);
CREATE INDEX idx_villages_district ON villages(district);
CREATE INDEX idx_villages_extant   ON villages(is_extant);
CREATE INDEX idx_villages_name_trgm ON villages USING gin (name gin_trgm_ops);

-- ============================================================================
--  ТРИГГЕР: автообновление updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_persons_updated
    BEFORE UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
