-- ============================================================================
--  Тептар — демонстрационные данные (seed)
--  Применение:  psql "$DATABASE_URL" -f seed.sql
--  Создаёт небольшое древо на 4 поколения для проверки поиска общего предка.
-- ============================================================================

-- Очистка (порядок важен из-за внешних ключей) ----------------------------
TRUNCATE change_log, admin_assignments, marriages, persons,
         gars, teips, tukhums, villages, users RESTART IDENTITY CASCADE;

-- Пользователи -------------------------------------------------------------
-- Пароль у всех демо-пользователей: demo12345 (scrypt salt:hash).
-- Логин — по телефону. Меняйте/удаляйте на проде!
INSERT INTO users (display_name, phone, role, password_hash) VALUES
    ('Супер-админ',          '+70000000000', 'super_admin',
     'be53d8cce0abe2b3d1b008913313896f:6008ff1a226c804f55505cfaa004b27d8d8cd1cef185810c24ab0b10c817cb003bc208d5899ddd708fe015b808edfa4e649dd07b47fcab64ffbae3f5c81b569c'),
    ('Админ тейпа (Ведено)', '+70000000001', 'teip_admin',
     'be53d8cce0abe2b3d1b008913313896f:6008ff1a226c804f55505cfaa004b27d8d8cd1cef185810c24ab0b10c817cb003bc208d5899ddd708fe015b808edfa4e649dd07b47fcab64ffbae3f5c81b569c'),
    ('Редактор',             '+70000000002', 'editor',
     'be53d8cce0abe2b3d1b008913313896f:6008ff1a226c804f55505cfaa004b27d8d8cd1cef185810c24ab0b10c817cb003bc208d5899ddd708fe015b808edfa4e649dd07b47fcab64ffbae3f5c81b569c');

-- Тукхумы ------------------------------------------------------------------
INSERT INTO tukhums (name, description) VALUES
    ('Нохчмахкахой', 'Историческое объединение тейпов восточной Чечни');

-- Тейпы --------------------------------------------------------------------
INSERT INTO teips (tukhum_id, name, description) VALUES
    (1, 'Беной',   'Один из крупнейших чеченских тейпов'),
    (1, 'Центарой','Тейп из Нохчмахкахой');

-- Гары (ветви) -------------------------------------------------------------
INSERT INTO gars (teip_id, name) VALUES
    (1, 'Жоврбий-некъи'),
    (1, 'Чопалби-некъи');

-- Сёла ---------------------------------------------------------------------
INSERT INTO villages (name, district) VALUES
    ('Ведено',   'Веденский район'),
    ('Беной-Ведено', 'Ножай-Юртовский район'),
    ('Грозный',  'г. Грозный');

-- ============================================================================
--  ДРЕВО (мужская линия). Общий предок ветвей — Ялхо (id=1).
--
--                         Ялхо (1)
--                        /        \
--                  Идрис (2)      Саид (3)
--                   /    \           \
--             Ахмад (4)  Умар (5)   Хасан (6)
--               /            \          \
--          Магомед (7)    Иса (8)     Рамзан (9)
--
--  Проверка: общий предок Магомеда (7) и Рамзана (9) — Ялхо (1).
--  Глубина: от 7 → 3 поколения, от 9 → 3 поколения.
-- ============================================================================

-- Поколение 0 — общий предок
INSERT INTO persons (full_name, gender, birth_year, death_year, teip_id, gar_id, village_id, note, status, created_by)
VALUES ('Ялхо Бенойский', 'm', 1850, 1915, 1, 1, 2, 'Родоначальник ветви', 'approved', 1);

-- Поколение 1 (дети Ялхо, id=1)
INSERT INTO persons (full_name, gender, birth_year, death_year, father_id, teip_id, gar_id, village_id, status, created_by) VALUES
    ('Идрис Ялхоевич', 'm', 1878, 1944, 1, 1, 1, 2, 'approved', 1),
    ('Саид Ялхоевич',  'm', 1882, 1951, 1, 1, 2, 1, 'approved', 1);

-- Поколение 2
INSERT INTO persons (full_name, gender, birth_year, death_year, father_id, teip_id, gar_id, village_id, status, created_by) VALUES
    ('Ахмад Идрисович', 'm', 1905, 1979, 2, 1, 1, 2, 'approved', 1),  -- id=4
    ('Умар Идрисович',  'm', 1910, 1988, 2, 1, 1, 1, 'approved', 1),  -- id=5
    ('Хасан Саидович',  'm', 1912, 1990, 3, 1, 2, 1, 'approved', 1);  -- id=6

-- Поколение 3
INSERT INTO persons (full_name, gender, birth_year, death_year, father_id, teip_id, gar_id, village_id, status, created_by) VALUES
    ('Магомед Ахмадович', 'm', 1940, 2010, 4, 1, 1, 3, 'approved', 1),  -- id=7
    ('Иса Умарович',      'm', 1945, NULL, 5, 1, 1, 3, 'approved', 1),  -- id=8
    ('Рамзан Хасанович',  'm', 1948, NULL, 6, 1, 2, 3, 'approved', 1);  -- id=9

-- Обновим is_alive у живых
UPDATE persons SET is_alive = TRUE WHERE death_year IS NULL;

-- Пример брака -------------------------------------------------------------
-- (жена для Ахмада, чтобы продемонстрировать таблицу marriages)
INSERT INTO persons (full_name, gender, birth_year, teip_id, village_id, status, created_by)
VALUES ('Зайнаб (супруга Ахмада)', 'f', 1908, 2, 2, 'approved', 1); -- id=10
INSERT INTO marriages (husband_id, wife_id, start_year) VALUES (4, 10, 1928);

-- Назначение админа тейпа Беной на село Ведено ----------------------------
INSERT INTO admin_assignments (user_id, teip_id, village_id) VALUES (2, 1, 1);

-- Готово. Проверьте поиск общего предка: a=7, b=9  → ожидается ancestor_id=1
