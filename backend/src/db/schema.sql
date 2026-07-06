-- ============================================================================
--  Тептар — схема базы данных (PostgreSQL 14+)
--  Генеалогическое древо чеченских тейпов.
--  Применение:  psql "$DATABASE_URL" -f schema.sql
-- ============================================================================

-- Расширения --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- нечёткий поиск по ФИО
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- левенштейн для вариантов написания

-- Для чистого пересоздания при разработке (ОСТОРОЖНО на проде!) ------------
DROP TABLE IF EXISTS change_log        CASCADE;
DROP TABLE IF EXISTS keeper_applications CASCADE;
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
    approx_lat  DOUBLE PRECISION, -- приблизительный центр исторической области тукхума
    approx_lng  DOUBLE PRECISION,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Тейп (клан) — базовая единица принадлежности
CREATE TABLE teips (
    id          BIGSERIAL PRIMARY KEY,
    tukhum_id   BIGINT REFERENCES tukhums(id) ON DELETE SET NULL,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    origin_place TEXT,             -- историческое место основания (аул/ущелье)
    origin_lat   DOUBLE PRECISION, -- широта метки на карте
    origin_lng   DOUBLE PRECISION, -- долгота метки на карте
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
    -- Принадлежность пользователя: тейп и село указываются при регистрации,
    -- чтобы пользователь сразу был прикреплён к модераторам своего тейпа.
    teip_id       BIGINT REFERENCES teips(id)    ON DELETE SET NULL,
    village_id    BIGINT REFERENCES villages(id) ON DELETE SET NULL,
    -- Явный корень личного древа (самый старший добавленный предок).
    -- FK на persons добавляется ALTER-ом ниже (persons создаётся позже).
    root_person_id BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Коды подтверждения e-mail при регистрации. Пользователь создаётся
-- только после ввода верного кода; до этого данные регистрации ждут здесь.
CREATE TABLE email_verifications (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL,
    code          TEXT NOT NULL,               -- 6 цифр
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    teip_id       BIGINT REFERENCES teips(id)    ON DELETE SET NULL,
    village_id    BIGINT REFERENCES villages(id) ON DELETE SET NULL,
    attempts      INT  NOT NULL DEFAULT 0,     -- неверные попытки ввода
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_email_verif_email ON email_verifications(email);

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

    -- Имена жён (жён может быть несколько). Жёны хранятся строками при муже,
    -- а не отдельными персонами: древо строится по мужской линии.
    spouse_names TEXT[],

    -- Видимость и модерация.
    -- visibility: личное древо (private, по умолчанию) видит только владелец;
    -- public — отправлено в общую базу. status релевантен только для public:
    -- pending → approved/rejected (модерация древа целиком).
    visibility  TEXT NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('private','public')),
    status      TEXT NOT NULL DEFAULT 'approved'
                CHECK (status IN ('pending','approved','rejected')),
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

    -- Правки опубликованной записи ждут модерации здесь (старые данные остаются публичными).
    pending_diff JSONB,
    pending_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    pending_at  TIMESTAMPTZ,

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

-- Корень личного древа ссылается на persons (объявлен в users выше).
ALTER TABLE users
    ADD CONSTRAINT fk_users_root_person
    FOREIGN KEY (root_person_id) REFERENCES persons(id) ON DELETE SET NULL;

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
--  ЧЕРНОВИКИ «МОЕГО ДРЕВА» (синхронизация редактора между устройствами)
--  JSON карточек редактора хранится как есть; localStorage — офлайн-кэш.
-- ============================================================================

CREATE TABLE tree_drafts (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data        JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  ХРАНИТЕЛИ ТЕПТАРА: заявки на роль модератора-знатока тейпа
-- ============================================================================

CREATE TABLE keeper_applications (
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

CREATE INDEX idx_keeper_apps_status ON keeper_applications(status);
CREATE INDEX idx_keeper_apps_user   ON keeper_applications(user_id);

-- Не больше одной заявки «на рассмотрении» на пользователя.
CREATE UNIQUE INDEX uq_keeper_apps_user_pending
    ON keeper_applications(user_id) WHERE status = 'pending';

-- ============================================================================
--  ПРЕДЛОЖЕНИЯ ОБЪЕДИНЕНИЯ ДРЕВ (авто-поиск одного человека в разных древах)
-- ============================================================================
--  Когда чьё-то древо отправляют/одобряют, система сверяет его людей
--  с чужими древами. Вероятные совпадения (один и тот же предок)
--  попадают сюда — модератор решает: объединить или отклонить.

CREATE TABLE merge_suggestions (
    id           BIGSERIAL PRIMARY KEY,
    person_a_id  BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    person_b_id  BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    similarity   REAL   NOT NULL DEFAULT 0,
    status       TEXT   NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','merged','dismissed')),
    resolved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Канонический порядок пары (a<b) — чтобы не было двух записей на одну пару.
    CONSTRAINT chk_ms_order CHECK (person_a_id < person_b_id)
);

CREATE UNIQUE INDEX uq_merge_pair    ON merge_suggestions(person_a_id, person_b_id);
CREATE INDEX        idx_merge_status ON merge_suggestions(status);

-- ============================================================================
--  ОБЪЕДИНЁННЫЕ ДРЕВА (неразрушительное слияние по общему предку)
-- ============================================================================
--  Когда модератор объединяет два древа, ИСХОДНЫЕ древа не меняются.
--  Вместо этого создаётся запись-связь: якорь A и якорь B — один и тот же
--  предок. Общее древо собирается «на лету» из обеих веток. Пара владеет
--  им совместно. Общее древо сначала уходит на повторную модерацию
--  (status pending) и становится публичным только после одобрения (approved).

CREATE TABLE tree_merges (
    id                BIGSERIAL PRIMARY KEY,
    anchor_a_id       BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    anchor_b_id       BIGINT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    -- Итоговые поля общего предка («шапка» объединённого древа).
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
    -- Канонический порядок пары (a<b) — одна связь на пару предков.
    CONSTRAINT chk_tm_order CHECK (anchor_a_id < anchor_b_id)
);

CREATE UNIQUE INDEX uq_tree_merge_pair  ON tree_merges(anchor_a_id, anchor_b_id);
CREATE INDEX        idx_tree_merge_stat ON tree_merges(status);

-- ============================================================================
--  ИНДЕКСЫ
-- ============================================================================

CREATE INDEX idx_persons_father    ON persons(father_id);
CREATE INDEX idx_persons_mother    ON persons(mother_id);
CREATE INDEX idx_persons_teip      ON persons(teip_id);
CREATE INDEX idx_persons_village   ON persons(village_id);
CREATE INDEX idx_persons_status    ON persons(status);
CREATE INDEX idx_persons_created_by ON persons(created_by);
CREATE INDEX idx_persons_visibility ON persons(visibility, status);
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
