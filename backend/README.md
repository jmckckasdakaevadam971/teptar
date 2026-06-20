# Teptar Backend

API-сервер генеалогической платформы. Node.js + Express + TypeScript + PostgreSQL.

## Запуск

```bash
cp .env.example .env          # настроить DATABASE_URL и JWT_SECRET
npm install
npm run db:init               # применить schema.sql + seed.sql (демо-данные)
npm run dev                   # http://localhost:4000
```

Проверка: открыть <http://localhost:4000/api/health>.

## Структура

```text
src/
├─ index.ts            # запуск сервера
├─ app.ts              # сборка Express, монтаж модулей
├─ config/env.ts       # переменные окружения
├─ db/
│  ├─ pool.ts          # пул PostgreSQL + query() + withTransaction()
│  ├─ schema.sql       # DDL
│  └─ seed.sql         # демо-данные
├─ middleware/         # auth (JWT, RBAC), error
├─ utils/              # http, asyncHandler
└─ modules/            # бизнес-логика (по папке на домен)
   ├─ persons/         # CRUD людей
   ├─ relations/       # браки
   ├─ teips/           # тейпы/тукхумы/гары
   ├─ villages/        # сёла
   ├─ ancestors/       # деревья + общий предок
   ├─ export/          # CSV / Visio / (XLSX, PDF — TODO)
   └─ auth/            # регистрация, вход, роли
```

Каждый модуль: `*.routes.ts` → `*.controller.ts` → `*.service.ts` → `*.types.ts`.

## Основные эндпоинты

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/api/health` | публично |
| GET | `/api/persons?q=&teip_id=&village_id=` | публично |
| GET | `/api/persons/:id` | публично |
| POST | `/api/persons` | авторизация |
| PATCH | `/api/persons/:id` | авторизация |
| DELETE | `/api/persons/:id` | teip_admin, super_admin |
| GET | `/api/ancestors/:id/up?depth=` | публично |
| GET | `/api/ancestors/:id/down?depth=` | публично |
| GET | `/api/ancestors/common?a=&b=` | публично |
| GET | `/api/teips` · `/api/teips/:id/gars` | публично |
| GET | `/api/villages?q=` | публично |
| GET | `/api/export/tree/:id?format=csv\|visio` | публично |
| POST | `/api/auth/register` · `/login` | публично |
| GET | `/api/auth/me` | авторизация |
| POST | `/api/auth/assign-admin` | super_admin |

## Примеры запросов

```bash
# Общий предок Магомеда (7) и Рамзана (9) — на демо-данных вернёт Ялхо (id=1)
curl "http://localhost:4000/api/ancestors/common?a=7&b=9"

# Дерево потомков Ялхо в CSV
curl "http://localhost:4000/api/export/tree/1?format=csv" -o tree.csv

# Регистрация
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Тест","phone":"+79991112233","password":"secret12"}'
```

## Заметки

- Ошибки `Не удается найти модуль "express"` в редакторе до `npm install` — нормально.
- XLSX и PDF экспорт — заглушки (501). См. [docs/ROADMAP.md](../docs/ROADMAP.md), этап 4.
