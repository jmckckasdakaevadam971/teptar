# Архитектура — Тептар

## 1. Обзор

Классическая трёхзвенная архитектура: **клиент (Next.js) → API (Express) →
PostgreSQL**. Тяжёлая визуализация дерева выполняется в браузере, сервер отдаёт
компактный JSON. Экспорт-операции (PDF через Puppeteer) выносятся в фоновую
очередь, чтобы не нагружать веб-поток.

```text
┌────────────────┐     HTTPS/JSON    ┌────────────────┐     SQL     ┌────────────┐
│  Next.js (SPA) │ ───────────────►  │ Express API    │ ─────────►  │ PostgreSQL │
│  D3 / family-  │ ◄───────────────  │ (TypeScript)   │ ◄─────────  │            │
│  chart         │                   │  модули        │             └────────────┘
└────────────────┘                   │  + воркеры     │
                                      └──────┬─────────┘
                                             │ экспорт (фон)
                                       ┌─────▼──────┐
                                       │ Puppeteer  │ → PDF
                                       │ ExcelJS    │ → XLSX
                                       └────────────┘
```

## 2. Технологический стек

| Слой | Технология | Обоснование |
| --- | --- | --- |
| UI | Next.js + React + TypeScript | SSR/маршрутизация, типобезопасность |
| Визуализация | D3.js / `family-chart` | анимированные деревья из коробки |
| API | Node.js + Express + TypeScript | простота, есть опыт (mailer DAKIR) |
| Доступ к БД | `pg` (node-postgres) | прямой SQL + рекурсивные CTE |
| БД | PostgreSQL | рекурсия, индексы, JSONB |
| Auth | JWT (или Appwrite из DAKIR) | роли, сессии |
| Экспорт | ExcelJS, Puppeteer | XLSX и PDF |
| Валидация | Zod | схемы запросов |

## 3. Backend — модульная структура

Каждый бизнес-модуль самодостаточен: маршруты → контроллер → сервис (SQL) → типы.
Это и есть «код не в одном файле»: добавление фичи = добавление модуля.

```text
backend/src/
├─ index.ts                # точка входа (запуск сервера)
├─ app.ts                  # сборка Express-приложения, монтаж модулей
├─ config/
│  └─ env.ts               # чтение и валидация переменных окружения
├─ db/
│  ├─ pool.ts              # пул соединений PostgreSQL
│  ├─ schema.sql           # DDL всех таблиц + индексы
│  └─ seed.sql             # демо-данные
├─ middleware/
│  ├─ error.ts             # централизованная обработка ошибок
│  └─ auth.ts              # проверка JWT и ролей (RBAC)
├─ utils/
│  ├─ http.ts              # хелперы ответов
│  └─ asyncHandler.ts      # обёртка async-роутов
└─ modules/
   ├─ persons/             # CRUD людей
   │  ├─ persons.routes.ts
   │  ├─ persons.controller.ts
   │  ├─ persons.service.ts
   │  └─ persons.types.ts
   ├─ relations/           # браки и связи
   ├─ teips/               # тейпы, тукхумы, гары
   ├─ villages/            # сёла
   ├─ ancestors/           # деревья + поиск общего предка
   ├─ export/              # Excel / PDF / Visio
   └─ auth/                # пользователи, вход, роли, назначения админов
```

### Поток запроса

```text
HTTP → routes → (middleware: auth) → controller → service → pg → PostgreSQL
                                          │
                                    (валидация Zod)
```

## 4. Frontend — структура

```text
frontend/src/
├─ app/                    # маршруты Next.js (App Router)
│  ├─ page.tsx             # главная (поиск)
│  ├─ person/[id]/page.tsx # карточка + древо
│  ├─ tree/page.tsx        # полноэкранное древо
│  └─ admin/page.tsx       # очередь модерации
├─ components/             # переиспользуемые UI-компоненты
│  ├─ TreeView/            # D3-древо (анимация)
│  ├─ PersonCard/
│  └─ SearchBar/
├─ features/              # фичи (общий предок, экспорт)
│  ├─ commonAncestor/
│  └─ export/
├─ lib/
│  ├─ api.ts               # типизированный API-клиент
│  └─ types.ts             # общие типы (Person, Teip…)
└─ styles/
```

## 5. API (черновик эндпоинтов MVP)

| Метод | Путь | Описание |
| --- | --- | --- |
| `GET` | `/api/persons` | Поиск/список (фильтры: name, teip, village) |
| `GET` | `/api/persons/:id` | Карточка человека |
| `POST` | `/api/persons` | Создать (→ pending) |
| `PATCH` | `/api/persons/:id` | Изменить (→ pending) |
| `GET` | `/api/persons/:id/ancestors` | Предки до N поколений |
| `GET` | `/api/persons/:id/descendants` | Потомки |
| `GET` | `/api/ancestors/common?a=&b=` | Общий предок двух людей |
| `GET` | `/api/teips` / `/api/villages` | Справочники |
| `POST` | `/api/auth/register` · `/login` | Аутентификация |
| `GET` | `/api/moderation/queue` | Очередь правок (teip_admin) |
| `POST` | `/api/moderation/:id/approve` | Одобрить |
| `GET` | `/api/export/tree/:id?format=xlsx\|pdf\|visio` | Экспорт |

## 6. Серверная конфигурация (деплой)

| Этап | vCPU | RAM | Диск | Комментарий |
| --- | --- | --- | --- | --- |
| MVP | 2 | 4 ГБ | 50 ГБ SSD | API + PostgreSQL + Nginx на одной VPS |
| Рост | 4 | 8 ГБ | 80–160 ГБ | вынести БД и очередь экспорта |
| Масштаб | 4–8 | 16 ГБ | 200+ ГБ | отдельная БД, Redis, балансировщик |

> ⚠️ Не размещать на текущем сервере DAKIR (77.232.131.36) — он занят Appwrite.
> Для Тептара нужен **отдельный VPS**.

## 7. Локальный запуск

```bash
# PostgreSQL должен быть доступен (локально или в Docker)
docker run -d --name teptar-pg -e POSTGRES_PASSWORD=teptar \
  -e POSTGRES_DB=teptar -p 5432:5432 postgres:16

# Backend
cd backend
cp .env.example .env
npm install
npm run db:init      # применяет schema.sql + seed.sql
npm run dev          # http://localhost:4000

# Frontend
cd ../frontend
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000
```
