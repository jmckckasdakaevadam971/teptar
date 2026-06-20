# Проектирование базы данных — Тептар

СУБД: **PostgreSQL 14+**. Выбор обусловлен поддержкой рекурсивных запросов
(`WITH RECURSIVE`), JSONB для журналов изменений и зрелостью экосистемы.

> Ключевая идея: генеалогия — это **граф**, а не таблица. По мужской линии это
> почти дерево, но из-за родственных браков формально это **DAG**
> (ориентированный ациклический граф). Поэтому связи родитель→ребёнок хранятся
> прямо в `persons` (для быстрого рекурсивного обхода), а браки — отдельно.

---

## 1. ER-диаграмма (логическая)

```text
 tukhums (союз тейпов)
    │ 1
    │
    │ N
 teips (тейп) ───< gars (ветвь рода)
    │ 1                  │
    │                    │
    │ N                  │ N
 persons >───────────────┘
    ├── father_id ──► persons   (самосвязь, мужская линия)
    ├── mother_id ──► persons   (самосвязь, женская линия)
    ├── village_id ─► villages
    ├── teip_id ────► teips
    └── gar_id ─────► gars

 marriages (браки):  husband_id ──► persons,  wife_id ──► persons

 users (пользователи)
    └──< admin_assignments >── teips / villages   (кто какой тейп/село модерирует)

 change_log: person_id ──► persons,  user_id ──► users   (история правок)
```

## 2. Таблицы

### 2.1 Справочники родовой иерархии

| Таблица | Назначение |
| --- | --- |
| `tukhums` | Тукхум — союз тейпов (опционально) |
| `teips` | Тейп (клан). Базовая единица принадлежности |
| `gars` | Гар — ветвь внутри тейпа (опционально) |
| `villages` | Населённые пункты (+ район) |

### 2.2 Ядро — `persons`

Главная таблица. Хранит человека и его прямые связи с родителями.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | BIGSERIAL PK | Идентификатор |
| `full_name` | TEXT | ФИО |
| `gender` | CHAR(1) | `m` / `f` |
| `birth_year` | INT | Год рождения (может быть NULL) |
| `death_year` | INT | Год смерти (NULL = неизвестно) |
| `is_alive` | BOOL | Жив ли (влияет на приватность) |
| `father_id` | BIGINT FK→persons | Отец (мужская линия) |
| `mother_id` | BIGINT FK→persons | Мать |
| `teip_id` | BIGINT FK→teips | Тейп (обычно наследуется от отца) |
| `gar_id` | BIGINT FK→gars | Ветвь |
| `village_id` | BIGINT FK→villages | Населённый пункт |
| `note` | TEXT | Примечание (значимая информация) |
| `status` | TEXT | `pending` / `approved` / `rejected` |
| `created_by` | BIGINT FK→users | Кто внёс |
| `approved_by` | BIGINT FK→users | Кто одобрил |
| `created_at` / `updated_at` | TIMESTAMPTZ | Аудит |

**Почему `father_id`/`mother_id` прямо в таблице, а не отдельная таблица связей?**
Потому что 95% запросов — обход вверх/вниз по прямой линии. Хранение ссылок в
самой строке делает рекурсивный CTE простым и быстрым (индекс по `father_id`).

### 2.3 Браки — `marriages`

Отдельно, т.к. это связь «многие-ко-многим» и не нужна для обхода линии.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | BIGSERIAL PK | |
| `husband_id` | BIGINT FK→persons | |
| `wife_id` | BIGINT FK→persons | |
| `start_year` / `end_year` | INT | Период |
| `note` | TEXT | |

### 2.4 Пользователи и модерация

| Таблица | Назначение |
| --- | --- |
| `users` | Учётные записи, роль (`viewer/editor/teip_admin/super_admin`) |
| `admin_assignments` | Привязка `teip_admin` к тейпу и селу |
| `change_log` | История изменений персон (JSONB diff) для аудита и споров |

## 3. Ключевые рекурсивные запросы

### 3.1 Все предки человека (вверх по линии)

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, full_name, father_id, mother_id, 0 AS depth
  FROM persons WHERE id = $1
  UNION ALL
  SELECT p.id, p.full_name, p.father_id, p.mother_id, a.depth + 1
  FROM persons p
  JOIN ancestors a ON p.id = a.father_id OR p.id = a.mother_id
)
SELECT * FROM ancestors WHERE depth > 0 ORDER BY depth;
```

### 3.2 Все потомки человека (вниз)

```sql
WITH RECURSIVE descendants AS (
  SELECT id, full_name, father_id, mother_id, 0 AS depth
  FROM persons WHERE id = $1
  UNION ALL
  SELECT p.id, p.full_name, p.father_id, p.mother_id, d.depth + 1
  FROM persons p
  JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
)
SELECT * FROM descendants WHERE depth > 0 ORDER BY depth;
```

### 3.3 Общий предок двух людей (главная фича)

Идея: получить множество предков A с глубиной, то же для B, пересечь по `id`,
выбрать предка с минимальной суммарной глубиной — это ближайший общий предок.

```sql
WITH RECURSIVE
anc_a AS (
  SELECT id, father_id, mother_id, 0 AS depth FROM persons WHERE id = $1
  UNION ALL
  SELECT p.id, p.father_id, p.mother_id, a.depth + 1
  FROM persons p JOIN anc_a a ON p.id = a.father_id OR p.id = a.mother_id
),
anc_b AS (
  SELECT id, father_id, mother_id, 0 AS depth FROM persons WHERE id = $2
  UNION ALL
  SELECT p.id, p.father_id, p.mother_id, b.depth + 1
  FROM persons p JOIN anc_b b ON p.id = b.father_id OR p.id = b.mother_id
)
SELECT a.id AS ancestor_id,
       a.depth AS depth_from_a,
       b.depth AS depth_from_b,
       (a.depth + b.depth) AS total_distance
FROM anc_a a
JOIN anc_b b ON a.id = b.id
ORDER BY total_distance ASC
LIMIT 1;
```

`depth_from_a` и `depth_from_b` дают **степень родства** (например, 2 и 2 →
общий прадед → троюродные).

## 4. Индексы

```sql
CREATE INDEX idx_persons_father    ON persons(father_id);
CREATE INDEX idx_persons_mother    ON persons(mother_id);
CREATE INDEX idx_persons_teip      ON persons(teip_id);
CREATE INDEX idx_persons_village   ON persons(village_id);
CREATE INDEX idx_persons_status    ON persons(status);
-- Полнотекстовый/триграммный поиск по ФИО:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_persons_name_trgm ON persons USING gin (full_name gin_trgm_ops);
```

## 5. Защита от циклов

Хотя генеалогия — DAG, ошибка ввода может создать цикл (A — отец B, B — отец A).
Меры:

1. На уровне приложения — при назначении `father_id` проверять, что новый отец
   не входит в множество потомков ребёнка (запрос 3.2).
2. В рекурсивных CTE можно добавить защиту через массив посещённых `id`
   (`NOT p.id = ANY(path)`), чтобы запрос не зациклился даже при грязных данных.

## 6. Приватность (152-ФЗ)

- `is_alive = true` → карточка по умолчанию ограничена: видны только базовые
  поля или скрыта целиком до согласия.
- Полные данные живых людей — только при наличии согласия/по роли.
- `change_log` хранит, кто и что менял (подотчётность).

## 7. Масштаб

Данные текстовые и лёгкие: даже 1 млн персон ≈ сотни МБ. Узкое место — не объём,
а глубина рекурсии и качество данных. Для типичных деревьев (десятки поколений)
запросы отрабатывают за миллисекунды при наличии индексов по `father_id`.

Полная DDL — в [`backend/src/db/schema.sql`](../backend/src/db/schema.sql).
Демо-данные — в [`backend/src/db/seed.sql`](../backend/src/db/seed.sql).
