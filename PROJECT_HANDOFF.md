# PROJECT HANDOFF — Vorhda.ru (Тептар)

> **Дата консервации: 15 июля 2026.**
> Проект **ЗАКОНСЕРВИРОВАН**: сервер (~5000 ₽/мес) отключается для экономии.
> Этот документ — полная инструкция для человека или ИИ, который будет
> **возобновлять** проект. Прочитай его целиком, прежде чем что-то делать.

---

## 0. Коротко о главном

- **Что это:** vorhda.ru — «Тептар», платформа родословных (семейных древ)
  чеченских тейпов. Справочник тейпов/тукхумов/сёл, личные древа с модерацией,
  публичный каталог древ, объединение древ, роли и админка.
- **Код:** GitHub `jmckckasdakaevadam971/teptar`, ветка `main`. Всё запушено.
  Код — единственный источник истины; на сервере в `/opt/teptar` тот же git-репозиторий.
- **Данные:** полный дамп прод-БД и секреты сохранены **локально** в папке
  `BACKUP-2026-07-15/` (в корне рабочей копии; в git НЕ входит — добавлена в
  `.gitignore`). Подробности в разделе 2.
- **Владелец / супер-админ:** Адам, `07dakaev07@mail.ru` (user id=1).
- **Чтобы возобновить проект:** раздел 3 «Восстановление с нуля». Понадобится
  любой Linux-сервер с Docker (6+ GB RAM), домен vorhda.ru (продлевать у
  регистратора отдельно — он не зависит от сервера!) и папка `BACKUP-2026-07-15/`.

---

## 1. Состояние прода на момент консервации

Сайт https://vorhda.ru работал полностью. Последний коммит: `9b8a8da`
(страница тейпа `/reference/[id]` с историческими личностями).

**БД (PostgreSQL 16, база `teptar`, юзер `teptar`, 19 таблиц, ~10 MB):**

| Таблица       | Строк | Комментарий                                          |
| ------------- | ----- | ---------------------------------------------------- |
| users         | 9     | 4 super_admin, 1 teip_admin, 4 viewer                |
| persons       | 142   | персоны родовых древ                                 |
| teips         | 286   | 212 из списка Википедии-2016 + 74 добавлены админами |
| tukhums       | 14    | 9 классических + Нашхой/Пешхой/Майстой/Чинхой/Кей    |
| teip_aliases  | 2     | варианты написания (Аллерой, Цонтарой)               |
| tree_drafts   | 3     | черновики древ                                       |
| change_log    | 87    | аудит действий                                       |
| gars          | 16    | гары (ветви тейпов)                                  |
| teip_notables | 0     | исторические личности тейпов (функция новая)         |

**Пользователи:** id=1 `07dakaev07@mail.ru` (владелец, super_admin),
id=3/4/8 — super_admin, id=6 — teip_admin, остальные viewer. Пароли — scrypt
(`salt:hash`), восстанавливаются только сбросом.

**Функциональность на проде (всё работает):**

- Лендинг `/`, вход/регистрация `/login` (регистрация: ФИО, тейп — из
  справочника ИЛИ свободным текстом с заявкой на модерацию, село, e-mail
  подтверждение кода через SMTP).
- Справочник `/reference`: тукхумы → тейпы (поиск, алиасы), карточка тейпа →
  страница `/reference/[id]` (описание, тукхум, место основания на карте,
  исторические личности; super_admin редактирует всё инлайн).
- Личное древо `/my` (черновики + модерация изменений), публичный каталог
  `/trees`, страница древа `/trees/[id]`, объединённые древа `/trees/merged/[id]`.
- Экспорт древа PNG/PDF (палитра следует теме сайта) и VSDX.
- Доступ к ветви (branch-access), слоты в режиме ветви.
- «Хранители» `/keepers` (+`/keepers/apply`) — заявки на роль хранителя тейпа.
- Админка `/admin`: статистика, пользователи и роли, единая модерация,
  заявки на тейпы (approve/map-алиас/reject), заявки хранителей.
- Роли: `viewer → editor → teip_admin → super_admin`. Роль читается из БД на
  каждый запрос (не из JWT).
- Капча Cloudflare Turnstile **отключена** (ключи в .env пустые — бэкенд
  пропускает проверку). SMTP подтверждение e-mail — включено (smtp.bz).
- Фавикон — золотая эмблема VORHDA (башня+горы), sitemap.xml включает все
  страницы тейпов.

---

## 2. Что и где сохранено

### 2.1. Локальная папка `BACKUP-2026-07-15/` (НЕ в git! Не публиковать!)

Лежит в корне рабочей копии `ПРОЕКТ VORHDA.RU` на машине владельца.
**Содержит пароли и персональные данные. Хранить бережно, никому не передавать
кроме доверенного ИИ-агента при восстановлении.**

| Файл                    | Что это                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `vorhda-full-backup.sql`  | Полный дамп БД (schema + data, 19 таблиц, plain SQL, ~186 KB). MD5 `1d0c45a4b13de9a1b37b4f255cd15e84` |
| `vorhda-full-backup.dump` | Тот же дамп в custom-формате для `pg_restore` (~91 KB)                   |
| `prod.env`              | Полный `.env` прода: `POSTGRES_PASSWORD`, `JWT_SECRET`, SMTP-доступы, домен |
| `prod.secrets`          | Дубль паролей БД/JWT (файл `.secrets` с сервера)                          |

### 2.2. Git (GitHub `jmckckasdakaevadam971/teptar`)

Весь код, схема БД (`backend/src/db/schema.sql`), идемпотентные миграции
(`backend/scripts/db-init.js`), справочник (`reference_data.sql`),
docker-compose, nginx-конфиг, скрипты деплоя и этот документ.

### 2.3. Чего НЕТ и что не нужно

- Загружаемых файлов пользователей на диске сервера НЕТ (папок uploads/media
  не существует) — терять нечего.
- TLS-сертификаты Let's Encrypt не бэкапились — выпускаются заново бесплатно
  (`deploy/init-letsencrypt.sh`).
- Docker-볼юмы кроме `pgdata` (nginx_cache, certbot_*) — восстановимы автоматически.

### 2.4. Домен

`vorhda.ru` — зарегистрирован отдельно от сервера. **Продление домена не
зависит от консервации сервера** — если домен нужен, продлевай у регистратора.
DNS: A-запись указывала на `85.239.41.76` (Timeweb). При переезде — сменить
A-запись на новый IP.

---

## 3. Восстановление с нуля (пошагово)

Понадобится: Linux-сервер (Ubuntu 22.04+, Docker + docker compose plugin,
**минимум 6 GB RAM** — меньше нельзя, сборка образов уложит сервер в OOM),
доступ к DNS домена, папка `BACKUP-2026-07-15/`.

```bash
# 1. На новом сервере
mkdir -p /opt/teptar && cd /opt/teptar
git clone https://github.com/jmckckasdakaevadam971/teptar.git .

# 2. Секреты: скопировать prod.env из бэкапа на сервер как /opt/teptar/.env
#    (scp с Windows: класть файл во временный ASCII-путь типа C:\tmp,
#     кириллица/пробелы в пути ломают scp)
scp C:/tmp/prod.env root@NEW_IP:/opt/teptar/.env

# 3. Поднять ТОЛЬКО базу (пустую)
docker compose up -d db
sleep 10

# 4. Влить дамп в ПУСТУЮ базу (дамп содержит схему + данные,
#    db-init запускать до этого НЕ нужно)
cat vorhda-full-backup.sql | docker compose exec -T db psql -U teptar -d teptar
# либо custom-форматом:
# docker compose cp vorhda-full-backup.dump db:/tmp/b.dump
# docker compose exec -T db pg_restore -U teptar -d teptar /tmp/b.dump

# 5. Проверить данные
docker compose exec -T db psql -U teptar -d teptar -c \
  "SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM teips) t, (SELECT count(*) FROM persons) p"
# Ожидаем: 9 / 286 / 142

# 6. Собрать образы — СТРОГО ПО ОДНОМУ (иначе OOM, см. раздел 5)
docker compose build backend
docker compose build db-init
docker compose build frontend

# 7. DNS: переключить A-запись vorhda.ru на IP нового сервера, дождаться
#    распространения (dig vorhda.ru), затем выпустить сертификаты:
./deploy/init-letsencrypt.sh   # использует DOMAIN и CERTBOT_EMAIL из .env

# 8. Поднять всё
docker compose up -d

# 9. Проверка
curl -s -o /dev/null -w '%{http_code}\n' https://vorhda.ru/          # 200
curl -s https://vorhda.ru/api/auth/config                            # JSON
```

Примечания:

- `db-init` при старте на уже наполненной базе безопасен: он идемпотентен
  (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) и данные не трёт.
  `FORCE_RESET=1` в .env — ОПАСНО, пересоздаёт схему (должно быть `0`).
- `SEED_DEMO=0` — обязательно (иначе демо-данные).
- В `.env` из бэкапа уже всё правильно: `DOMAIN=vorhda.ru`, SMTP smtp.bz,
  Turnstile пустой (капча выключена), реплики backend/frontend по 2.

---

## 4. Стек и архитектура

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind. SSR + клиентские
  компоненты. Тема светлая/тёмная (`ThemeToggle`, класс `dark` на `<html>`).
- **Backend:** Express + TypeScript, **ESM** (все импорты между файлами — с
  расширением `.js`!). Паттерн модуля: `*.routes.ts` → `*.controller.ts`
  (zod-валидация) → `*.service.ts` (SQL через `db/pool.ts`).
- **БД:** PostgreSQL 16 (alpine), доступ только из docker-сети.
- **Инфра:** docker compose на одном сервере: `db`, `db-init` (one-shot
  миграции), `backend`×2, `frontend`×2, `nginx` (TLS, HTTP/3, кэш, LB на
  реплики), `certbot` (авто-продление).

### Страницы фронта (frontend/src/app)

`/` (лендинг), `/login`, `/profile`, `/admin`, `/reference`,
`/reference/[id]` (страница тейпа), `/my` (моё древо), `/trees`,
`/trees/[id]`, `/trees/merged/[id]`, `/keepers`, `/keepers/apply`,
`/privacy`, `/terms`.

### Модули бэкенда (backend/src/modules)

`auth`, `admin`, `reference`, `teips`, `villages`, `persons`, `ancestors`,
`relations`, `export`, `keepers`, `branch-access`.

### Ключевые компоненты (frontend/src/components)

`DirectoryView` (справочник), `TeipDetail` (страница тейпа + notables),
`TeipRequests` (заявки на тейпы + TukhumPickDialog), `MyTreeClient`,
`TreeView` (canvas-рендер древа + экспорт PNG/PDF/VSDX), `PersonForm`,
`PublicTreesView`, `PublicTreeDetail`, `ModerationPanel`, `KeepersView`,
`BranchAccess`, `SiteHeader/SiteFooter`, `ThemeToggle`, `landing/*`.

### БД: главные таблицы

`tukhums → teips (→ gars → nekyi)` — родовая иерархия; `teip_aliases` —
варианты написания; `teip_requests` — заявки на новые тейпы из регистрации;
`teip_notables` — исторические личности тейпа; `villages`; `users` (роль,
teip_id, village_id, root_person_id); `persons` + `marriages` — древа;
`tree_drafts` — черновики; `tree_merges` — объединение древ (FK на persons
ON DELETE CASCADE!); `branch_access`; `keeper_applications`; `change_log` —
аудит; `email_verifications` — коды подтверждения.

Схема: `backend/src/db/schema.sql` (чистая установка) +
`backend/scripts/db-init.js` (идемпотентные миграции, запускается при каждом
деплое). **Новые миграции добавлять в ОБА файла.**

---

## 5. Деплой и эксплуатация (когда сервер снова будет)

```bash
# Локально
git push

# На сервере
ssh root@SERVER "cd /opt/teptar && git fetch origin main && git reset --hard origin/main"
ssh root@SERVER "cd /opt/teptar && docker compose build backend"    # ПО ОДНОМУ!
ssh root@SERVER "cd /opt/teptar && docker compose build db-init"    # если менялись миграции
ssh root@SERVER "cd /opt/teptar && docker compose build frontend"
ssh root@SERVER "cd /opt/teptar && docker compose up -d backend frontend"
```

**⚠️ ГЛАВНОЕ ПРАВИЛО: `docker compose build` — по одному образу.**
15 июля 2026 параллельная сборка backend+frontend+db-init уложила сервер
(6 GB RAM) в OOM: сайт и SSH висели ~40 минут, помогла только жёсткая
перезагрузка через панель хостинга. Не повторять.

- `db-init` собирается в **свой** образ — при изменении миграций обязательно
  `docker compose build db-init`, иначе на проде поедет старый код миграций.
- `.env` на сервере не перезаписывается деплоем.
- Проверка после деплоя: `curl -s -o /dev/null -w '%{http_code}' https://vorhda.ru/`.

---

## 6. Уроки и грабли (ОБЯЗАТЕЛЬНО к прочтению ИИ-агенту)

**Кодовая база:**

- Бэкенд — ESM: импорты с `.js` (`import x from "./x.js"`), иначе runtime-краш.
- Роут-порядок в Express важен: специфичные роуты (`/teips/requests`,
  `/teips/notables/:id`) — ДО catch-all (`/teips/:id`).
- `normalizeTeipName`: чеченская «палочка» Ӏ/I/l/i/|/!/1 приводится к «1»,
  функция продублирована на бэке и фронте — менять синхронно. НО: norm()
  НЕ приравнивает «й»/«1» — ручные маппинги проверять фактическим прогоном.
- Роль пользователя читается из БД на каждый запрос — смена роли действует
  сразу, без перевыпуска JWT.
- `tree_merges.anchor_a/b REFERENCES persons ON DELETE CASCADE` — удаление
  персоны сносит слияние.
- `OPEN_ACCESS=true` в `frontend/src/lib/auth.ts` — ВРЕМЕННО открытый доступ,
  вернуть `false` по просьбе владельца.
- Canvas-экспорт древа: палитра выбирается по теме
  (`document.documentElement.classList.contains("dark")`) в `renderTreeCanvas`
  (TreeView.tsx). `BRANCH_PALETTE` и `export-formats.ts` не трогать без запроса.

**Прод и данные:**

- На проде параллельно работают живые админы — «пропавшие» тестовые данные
  сначала искать в `change_log` (admin_delete_tree, unmerge).
- `pg_stat_user_tables.n_live_tup` ВРЁТ после жёсткой перезагрузки — считать
  реальными `COUNT(*)`.
- Порт 4000 бэкенда НЕ проброшен на хост — API тестировать изнутри контейнера
  (`docker compose exec -T backend node -e "fetch(...)"`).
- Админ-JWT для тестов: `docker compose exec -T backend node -e
  "console.log(require('jsonwebtoken').sign({userId:1,role:'super_admin'},process.env.JWT_SECRET))"`.
- Дамп custom-формата через `exec -T ... > file` обрывается — надёжно:
  `pg_dump --file=/tmp/x.dump` внутри контейнера, потом `docker compose cp`.

**Windows-машина владельца:**

- PowerShell 5: нет `&&` — использовать `;` и `if ($?)`.
- `npx`/`npm` — вызывать `npx.cmd`/`npm.cmd` (ps1-шимы заблокированы политикой).
- scp ломается на кириллице/пробелах в пути — копировать через `C:\tmp`.
- Многострочные скрипты по ssh: here-string `@'...'@ -replace "`r","" | ssh host "bash -s"`;
  кириллица в выводе ssh бьётся — оборачивать в `| base64 -w 0` и декодировать.
- `git push` пишет вывод в stderr (NativeCommandError) — пуш при этом ПРОХОДИТ,
  смотреть строку `main -> main`.

**Продукт (решения владельца):**

- Никаких плёнок/затемнений на фото — только контраст шрифта.
- Точного числа чеченских тейпов не существует (135 у Мамакаева, 366 у
  Натаева) — поэтому справочник открытый: неизвестный тейп при регистрации
  не блокирует, а создаёт заявку (`teip_requests`) для супер-админа.
- Список тейпов синхронизирован со списком Википедии (архив 26.08.2016):
  212 базовых, дальше пополняется заявками через модерацию.
- Везде, где создаётся тейп, должен быть выбор тукхума (TukhumPickDialog).

---

## 7. Внешние сервисы

| Сервис          | Детали                                                            |
| --------------- | ----------------------------------------------------------------- |
| Хостинг         | Timeweb, `root@85.239.41.76`, 6 GB / 4 vCPU (~5000 ₽/мес) — **отключается** |
| Домен           | vorhda.ru — продлевать у регистратора независимо от сервера       |
| SMTP            | smtp.bz (`connect.smtp.bz:9465`), логин/пароль в `prod.env`       |
| TLS             | Let's Encrypt, авто-продление certbot'ом                          |
| Капча Turnstile | ОТКЛЮЧЕНА (пустые ключи). Для включения: привязать домен в панели Cloudflare, вписать ключи в `.env`, `docker compose up -d --no-deps backend frontend` |

---

## 8. Идеи/недоделки на будущее (не обязательства)

- `teip_notables` пустая — наполнить исторические личности тейпов.
- Вернуть Turnstile-капчу (раздел 7).
- `OPEN_ACCESS` вернуть в `false`, когда владелец решит закрыть просмотр.
- В `/opt/teptar` на сервере валялись скриншоты и deploy.tar.gz вне git —
  при восстановлении с нуля их не будет, и это нормально.

---

_Автор проекта: Адам (07dakaev07@mail.ru). Документ обновлён 15.07.2026
при консервации. Для возобновления: дай новому ИИ этот файл + папку
`BACKUP-2026-07-15/` — этого достаточно._
