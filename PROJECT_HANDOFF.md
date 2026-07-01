# Тептар (Vorhda) — передача проекта другому ИИ-ассистенту

> Полный контекст проекта для продолжения работы в новом чате / на другом компьютере.
> Прочитай целиком прежде чем что-либо менять. Здесь: что за проект, как устроен код,
> что недавно изменилось, как деплоить и какое СЕЙЧАС состояние продакшена.
>
> Актуально на: **2 июля 2026**.

---

## 0. КОРОТКО О ГЛАВНОМ (прочитай первым делом)

- Проект: **веб-платформа по чеченским тейпам (родам)**. Боевой домен: **<https://vorhda.ru>**.
- Стек: **Next.js 14 (App Router) + Express/TypeScript + PostgreSQL 16**. Всё в Docker, деплой `deploy.sh`.
- **ВАЖНО — история смен курса:** функциональность **«Моё древо»** 29 июня была
  удалена по решению владельца, но затем **ВОЗВРАЩЕНА в новом виде** (коммиты a9d856c,
  398d705, fe089ad и др.): черновик древа на аккаунт (`/my`), публикация через
  модерацию, каталог одобренных древ (`/trees`, `/trees/[id]`, `/trees/merged`),
  предложения слияния древ. Раздел «6. Что было удалено» ниже — ИСТОРИЧЕСКАЯ
  справка, НЕ текущее состояние.
- Сейчас сайт = лендинг + справочник тейпов/тукхумов/сёл (с картами мест
  основания тейпов, Leaflet) + личные древа с модерацией + кабинет + админка.
- **Капча (Cloudflare Turnstile) ОТКЛЮЧЕНА** на проде (см. раздел 7). Вход/регистрация
  работают без проверки на бота, но на `/api/auth/login|register` стоит rate limit
  (10 попыток/мин с IP, `backend/src/middleware/rateLimit.ts`).
- Бэкенд-модули persons/ancestors/relations снова АКТИВНО используются фронтом.

---

## 1. Что это за проект (актуально)

«Тептар» (чеч. *тептар* — родовая летопись) — веб-приложение о родовой структуре
чеченского народа. На текущий момент пользователь может:

- просматривать **справочник**: тукхумы (союзы тейпов) → тейпы → гары (ветви) → села,
  включая **карту места основания тейпа** (точные координаты или приблизительный
  исторический район тукхума, Leaflet + OSM);
- вести **личное родовое древо** (`/my`): черновик на аккаунт, батч-отправка
  одной транзакцией, публикация через модерацию;
- смотреть **каталог одобренных древ** (`/trees`, `/trees/[id]`, объединённые — `/trees/merged`);
- зарегистрироваться и войти в **личный кабинет** (профиль, смена пароля);
- модераторам/админам — модерировать древа и слияния, управлять пользователями
  и ролями в **админке**.

Роли: `viewer` (читатель) → `editor` → `teip_admin` (админ тейпа) → `super_admin`.
«Модератор» = `teip_admin` или `super_admin`.

---

## 2. Технологический стек

| Слой | Технологии |
| --- | --- |
| Frontend | Next.js 14.2 (App Router), React 18, TypeScript, Tailwind 3.4, lucide-react |
| Backend | Node.js, Express, TypeScript (**ESM** — в импортах указывается `.js`!), zod |
| БД | PostgreSQL 16 (+ расширение **pg_trgm** для нечёткого поиска по ФИО) |
| Auth | JWT (`{ userId, role }`), пароли — scrypt (без внешних либ) |
| Инфра | Docker Compose, nginx, certbot (TLS), сервер Timeweb |

**Важно про ESM:** во всех бэкенд-импортах путь оканчивается на `.js`
(`import { x } from './foo.js'`), даже если файл `.ts`. Не ломай это.

---

## 3. Структура репозитория (актуальная)

```text
teptar/
├─ deploy.sh                     # ← одной командой: сборка образов + rsync на сервер + запуск
├─ docker-compose.yml            # backend×2, frontend×2, db, db-init, nginx, certbot
├─ deploy/
│  ├─ nginx.conf                 # reverse proxy (шаблон с ${DOMAIN}), кэш GET /api
│  └─ sync-db-password.sh        # авто-фикс пароля БД при деплое (см. раздел 8)
├─ docs/                         # ARCHITECTURE, DATABASE_DESIGN, MVP_PLAN, ROADMAP, DEPLOYMENT
├─ backend/
│  ├─ scripts/db-init.js         # идемпотентная инициализация/миграции БД при старте
│  └─ src/
│     ├─ app.ts                  # сборка Express, монтаж роутеров /api/*
│     ├─ index.ts
│     ├─ config/env.ts           # env (в т.ч. turnstileSiteKey/Secret)
│     ├─ db/
│     │  ├─ pool.ts              # query<T>(text, params) и withTransaction(fn)
│     │  ├─ schema.sql           # полная схема БД (таблицы древ остались)
│     │  ├─ reference_data.sql   # справочник тейпов/сёл (идемпотентно)
│     │  └─ seed.sql             # демо-данные (только при SEED_DEMO=1)
│     ├─ middleware/
│     │  ├─ auth.ts              # authOptional, requireAuth, requireRole(...)
│     │  └─ error.ts             # ZodError → 422 { error, details }, ApiError → status
│     └─ modules/                # routes → controller → service в каждом модуле
│        ├─ auth/                # ← АКТИВНО: регистрация, вход, профиль, смена пароля, Turnstile
│        ├─ admin/               # ← АКТИВНО: статистика, список пользователей, роли
│        ├─ reference/ teips/ villages/   # ← АКТИВНО: справочник (читает фронт /reference)
│        ├─ persons/             # ⚠️ остался в коде, фронтом НЕ используется
│        ├─ ancestors/           # ⚠️ остался в коде, фронтом НЕ используется
│        ├─ relations/           # ⚠️ остался в коде, фронтом НЕ используется
│        └─ export/              # ⚠️ остался в коде, фронтом НЕ используется
└─ frontend/
   └─ src/
      ├─ app/                    # App Router — ОСТАЛИСЬ ТОЛЬКО ЭТИ страницы:
      │  ├─ layout.tsx
      │  ├─ globals.css
      │  ├─ page.tsx             # лендинг (Hero + Stats + Features + About)
      │  ├─ login/page.tsx       # вход / регистрация (вкладки), клиентская валидация
      │  ├─ profile/page.tsx     # личный кабинет (данные, смена пароля)
      │  ├─ admin/page.tsx       # админка: статистика, пользователи, ModerationPanel
      │  └─ reference/page.tsx   # справочник (DirectoryView)
      ├─ components/             # ОСТАВШИЕСЯ компоненты:
      │  ├─ SiteHeader/ SiteFooter/        # шапка (Главная/Справочник[+Админ]) и подвал
      │  ├─ AppFrame/ PageShell/ PageHeader/   # каркасы страниц
      │  ├─ DirectoryView/                 # справочник тейпов/сёл (для /reference)
      │  ├─ ModerationPanel/               # очередь модерации (сейчас пустая)
      │  ├─ SearchBar/ Reveal/             # утилитарные
      │  └─ landing/ (HeroSection, StatsStrip, FeaturesSection, AboutSection)
      └─ lib/
         ├─ api.ts               # типизированный клиент эндпоинтов (+ методы древ — не используются)
         ├─ types.ts             # общие типы (ApiEnvelope.details типизирован)
         ├─ auth.ts              # useAuth, clearAuth, canModerate(role), patchStoredUser
         ├─ ui.ts                # общие классы Tailwind (BTN_PRIMARY, INPUT, CARD …)
         └─ utils.ts             # cn()
```

**Паттерн бэкенда:** каждый модуль = `*.routes.ts` (express Router) → `*.controller.ts`
(парсит вход zod-схемой, зовёт сервис) → `*.service.ts` (бизнес-логика + SQL).
Типы и zod-схемы — в `*.types.ts`.

**Навигация (SiteHeader):** только «Главная» и «Справочник»; для модераторов
добавляется «Админ». Справа — «Профиль» (если вошёл) или «Войти».

---

## 4. База данных

Файл схемы: `backend/src/db/schema.sql`. Таблицы (схема цела, удалены только ДАННЫЕ древ):

- **tukhums** → **teips** → **gars** → **nekyi** — справочник родовой иерархии.
- **villages** — населённые пункты (name, district, type…).
- **users** — пользователи: `id, display_name, phone, email, password_hash, role,
  root_person_id, created_at`. (`root_person_id` — наследие древ, сейчас у всех NULL.)
- **persons** — ядро древ. **Сейчас пустая** (0 строк). Схема и индексы на месте.
- **marriages** — браки. **Пустая.**
- **admin_assignments** — привязка teip_admin к тейпу/селу.
- **change_log** — аудит. **Пустая.**

**Текущее наполнение (прод, на момент передачи):**

| Таблица | Строк |
| --- | --- |
| persons | **0** |
| marriages | **0** |
| change_log | **0** |
| users | **4** (реальные аккаунты сохранены) |
| справочник (teips/villages/…) | заполнен из `reference_data.sql` |

**Инициализация БД** (`backend/scripts/db-init.js`): безопасна при каждом старте контейнера.

- Первый запуск (нет таблицы persons) → `schema.sql` + `reference_data.sql` (+ `seed.sql` если `SEED_DEMO=1`).
- Последующие → только `reference_data.sql` (идемпотентно) — **пользовательские данные не трогаются**.
- Идемпотентные миграции: `ADD COLUMN IF NOT EXISTS pending_diff/pending_by/pending_at`,
  `ADD COLUMN IF NOT EXISTS users.root_person_id` + FK через DO-блок.
- `FORCE_RESET=1` — пересоздать схему (ОПАСНО, стирает всё).

> ⚠️ db-init **не пересоздаёт** persons при обычном деплое, поэтому очистка данных
> древ (раздел 6) сохраняется между деплоями.

---

## 5. Аутентификация и доступ

- JWT в `localStorage` (`teptar_token`). Middleware:
  - `authOptional` — распознаёт пользователя, если токен есть (глобально в app.ts).
  - `requireAuth` — 401 если нет токена.
  - `requireRole('teip_admin','super_admin')` — для модерации/админки.
- Эндпоинты auth (`/api/auth/*`): `register`, `login`, `config` (отдаёт turnstile site key
  или null), `me`, `profile`, `PATCH profile`, `change-password`, `assign-admin` (super_admin).
- **Регистрация** требует `display_name` (≥2), `password` (≥8) и хотя бы одно из
  `phone`/`email`. Вход — по телефону **или** e-mail + пароль.

**Недавнее исправление ошибок валидации (важно):**

- Бэкенд (`auth.controller.ts`): zod-схемы `registerSchema`/`loginSchema` получили
  **русские** сообщения; ошибка «укажите телефон или e-mail» привязана к полю `phone`.
- Фронтенд (`lib/api.ts`): функция `request()` теперь извлекает `details.fieldErrors`/
  `formErrors` из ответа и показывает **конкретную причину**, а не общий
  «Ошибка валидации». Поле `details` типизировано в `ApiEnvelope` (`lib/types.ts`).
- Страница `login` получила **клиентскую** валидацию (имя ≥2, логин не пуст, пароль ≥8)
  для мгновенной подсказки до запроса к серверу.

---

## 6. ⭐ Что было удалено (ИСТОРИЧЕСКАЯ справка — древа ПОТОМ ВЕРНУЛИ)

> ⚠️ Этот раздел описывает события 29 июня. После этого функциональность древ
> была заново реализована в новом виде (черновики на аккаунт + модерация +
> каталог публичных древ): страницы `my/`, `trees/`, компоненты `MyTreeClient`,
> `TreeView`, `PersonForm`, `PublicTreesView`, `PublicTreeDetail` снова в коде и на проде.
> Список ниже — только история того удаления.

Владелец решил **полностью убрать** функциональность личных родовых древ.
Удалено (и выложено на прод):

**Страницы (frontend/src/app):** `my/`, `person/[id]/`, `person/[id]/edit/`,
`persons/new/`, `relatives/`, `trees/`.

**Компоненты:** `TreeView`, `PersonCard`, `PersonForm`, `PersonPicker`,
`RelativeAdder`, `RelationsView`, `TreesView`, `PublishControl`, `AuthNav`
(+`MyTreeNavLink`, `AdminNavLink`), `features/commonAncestor`, `features/export`.

**Правки оставшихся файлов:** из `profile` убрана статистика древа и кнопка «Моё древо»;
из `SiteFooter`/`HeroSection`/`FeaturesSection` убраны ссылки и реклама удалённых функций
(лендинг переориентирован на справочник); из `ModerationPanel` убрана ссылка на карточку персоны.
Починен сломанный `HeroSection` (остатки формы поиска).

**Данные в БД (прод):** выполнен `DELETE` из `change_log`, `marriages`, `persons`
(в таком порядке из-за FK), `users.root_person_id` обнулён каскадом
(`ON DELETE SET NULL`), sequence сброшены. **Аккаунты `users` сохранены.**

> Перед очисткой снят дамп БД. Резервная копия лежит **локально**:
> `~/teptar-backups/teptar-20260629-210547.sql` (~73 КБ, формат COPY).
> На сервере дамп клали в `/opt/teptar/backups/`, но **rsync --delete при деплое
> удаляет эту папку** — поэтому актуальна именно локальная копия.

**Маршруты после удаления (проверено curl):**
`/`, `/reference`, `/profile`, `/admin`, `/login` → 200; `/my`, `/trees`, `/relatives`,
`/persons/new`, `/person/1` → 404.

---

## 7. Капча (Cloudflare Turnstile) — ОТКЛЮЧЕНА

**Симптом, из-за которого отключили:** виджет в браузере показывал «Успешно ✅»,
но сервер на каждый вход/регистрацию отвечал «Проверка на бота не пройдена».
Диагностика показала: секретный ключ **верный** (siteverify возвращал
`invalid-input-response` на тестовый токен, а не `invalid-input-secret`).
Наиболее вероятная причина — **домен vorhda.ru не привязан к виджету** в панели
Cloudflare Turnstile (или указан другой), из-за чего живой токен отклонялся.

**Как отключили (на сервере):** в `/opt/teptar/.env` очищены значения:

```text
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET=
```

Логика (см. `backend/src/modules/auth/turnstile.ts` и `config/env.ts`):

- пустой `TURNSTILE_SECRET` → бэкенд **пропускает** проверку (`ok: true`);
- `GET /api/auth/config` отдаёт `turnstile_site_key: null` → фронт **не рисует** виджет.

`.env` исключён из rsync, поэтому отключение **переживает деплои**. Сделан бэкап
`.env.bak.<timestamp>` на сервере. В `turnstile.ts` оставлено диагностическое
логирование (`console.warn` с error-codes/hostname) — пригодится при возврате капчи.

**Чтобы вернуть капчу:** в панели Cloudflare привязать домен `vorhda.ru` к виджету,
затем вписать реальные `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET` в `/opt/teptar/.env`
и пересоздать контейнеры: `docker compose up -d --no-deps backend frontend`.

---

## 8. Деплой (рабочий, автоматический)

**Сервер:** Timeweb, IP `85.239.41.76`, пользователь `root`, директория `/opt/teptar`,
домен `vorhda.ru`. Стек docker compose: backend×2, frontend×2, db (postgres:16-alpine),
db-init (one-shot), nginx, certbot.

**Команда деплоя (с локальной машины, из корня репозитория):**

```bash
SERVER_USER=root SERVER_HOST=85.239.41.76 ./deploy.sh
```

Что делает `deploy.sh`: проверяет Docker → **rsync `--delete`** проекта на сервер
(исключая `node_modules`, `.next`, `.git`, `.env`, `*.log`) → настраивает `.env`
(домен/CORS/секреты идемпотентно) → собирает образы → поднимает БД →
**синхронизирует пароль БД** → прогоняет `db-init` → проверяет TLS → поднимает весь стек.

> ⚠️ **rsync `--delete`** означает: то, что удалено локально, удалится и на сервере.
> Именно так удаление страниц/компонентов древ попало в прод. Имей это в виду.

> Секреты (POSTGRES_PASSWORD, JWT_SECRET) лежат в `.secrets`/`.env` на сервере.
> **DB-суперпользователь — `teptar`** (НЕ `postgres`), БД называется `teptar`.

**⚠️ Авто-фикс `auth_failed (28P01)` при деплое:** том `pgdata` хранит пароль,
заданный при первой инициализации. Если он разойдётся с `.env`, `db-init` упал бы.
`deploy/sync-db-password.sh` (вызывается из `deploy.sh` ДО db-init) через локальный
trust-сокет делает `ALTER ROLE "teptar" WITH PASSWORD '<из .env>'`. Деплой чинит пароль сам.

**⚠️ Терминальная ловушка (macOS zsh):** команды с кириллицей/незакрытыми кавычками
иногда вешают терминал в режим `dquote>`. Избегай кириллицы в `echo` внутри ssh,
закрывай кавычки. Восстановление: одиночная `"` + Enter, либо новый терминал.

---

## 9. Текущее состояние продакшена (на момент передачи)

- ✅ Сайт жив: <https://vorhda.ru>. Страницы `/`, `/reference`, `/profile`, `/admin`,
  `/login` → 200; удалённые маршруты древ → 404.
- ✅ БД: persons/marriages/change_log = 0; `users` = 4 (реальные аккаунты сохранены);
  справочник заполнен.
- ✅ Капча отключена: `/api/auth/config` → `turnstile_site_key: null`; регистрация и
  вход проходят без токена (проверено curl).
- ✅ Регистрация: внятные русские сообщения об ошибках валидации (и на сервере, и в UI).
- 🟡 В коде остались неиспользуемые фронтом бэкенд-модули древ (persons/ancestors/
  relations/export) и методы древ в `lib/api.ts`. Не мешают, но «мёртвые».

**Ветка:** `main`, всё запушено в `origin/main` и задеплоено.
Ключевые недавние коммиты: удаление «Моё древо» и древ; fix валидации регистрации;
debug-логирование Turnstile.

---

## 10. Возможные дальнейшие шаги (если попросят)

1. **Дочистить «мёртвый» код древ** (если решат не возвращать функциональность):
   удалить бэкенд-модули `persons/`, `ancestors/`, `relations/`, `export/` и их монтаж
   в `app.ts`; убрать соответствующие методы и типы из `lib/api.ts`/`lib/types.ts`;
   при желании — `ModerationPanel` и связанные admin-эндпоинты модерации.
   ⚠️ Проверить, что `admin/page.tsx` не сломается (он импортит `ModerationPanel`).
2. **Решить судьбу таблиц древ в схеме** (`persons`, `marriages`, `change_log`,
   `users.root_person_id`): оставить пустыми или удалить миграцией. Не трогать, пока не попросят.
3. **Капча:** при необходимости вернуть — сперва привязать домен в Cloudflare (раздел 7).
4. Всегда **читай файлы целиком** перед правками; бэкенд — ESM (импорты с `.js`).
5. Проверяй сборку: backend `cd backend && npm run build` (tsc),
   frontend `cd frontend && npm run build` (next). Затем деплой.
6. Не создавай лишних markdown-отчётов без явной просьбы.

---

## 11. Полезные команды

```bash
# Сборка / проверка типов
cd backend  && npm run build         # tsc
cd frontend && npm run build         # next build

# Локальный запуск (если нужно)
cd backend  && npm run dev
cd frontend && npm run dev

# Деплой (из корня репозитория)
SERVER_USER=root SERVER_HOST=85.239.41.76 ./deploy.sh

# На сервере
ssh root@85.239.41.76 'cd /opt/teptar && docker compose ps'
ssh root@85.239.41.76 'cd /opt/teptar && docker compose logs -f backend'

# Проверка боевых эндпоинтов
curl -s -o /dev/null -w '%{http_code}\n' https://vorhda.ru/
curl -s https://vorhda.ru/api/auth/config            # ожидаем turnstile_site_key: null

# Счётчики БД (быстрый аудит)
ssh root@85.239.41.76 'docker exec teptar-db-1 sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"SELECT (SELECT count(*) FROM persons) AS persons, (SELECT count(*) FROM users) AS users;\""'

# Снять дамп БД вручную (если нужно)
ssh root@85.239.41.76 'docker exec teptar-db-1 sh -c "pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB"' > ~/teptar-backups/teptar-$(date +%Y%m%d-%H%M%S).sql
```

---

*Конец файла. Если чего-то не хватает — спроси у владельца проекта (автор: Adam). Удачи!*
