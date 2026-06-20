# Тептар (Teptar)

**Генеалогическая платформа для чеченских родов (тейпов).**

Тептар (чеч. *тептар* — родовая летопись/книга) — веб-приложение для ведения
генеалогического древа по тейпам, поиска общих предков и совместной модерации
данных администраторами от тейпов в каждом селе.

---

## Возможности

- 🌳 Ведение родословной по мужской линии с привязкой к тейпу/гару/селу.
- 🔍 Поиск **общих предков** между двумя людьми.
- 🎬 Анимированный интерактивный просмотр древа.
- 📤 Экспорт в **Excel**, **PDF** и формат для **Microsoft Visio**.
- 🛡 Модерация: администратор тейпа в каждом селе следит за корректностью данных.
- 👤 Карточка человека: ФИО, годы жизни, населённый пункт, примечание.

## Технологии

| Слой | Технологии |
| --- | --- |
| Frontend | Next.js (React), TypeScript, D3.js / family-chart |
| Backend | Node.js, Express, TypeScript |
| База данных | PostgreSQL (рекурсивные CTE) |
| Экспорт | ExcelJS, Puppeteer (PDF), VDX/Excel-Data-Visualizer (Visio) |

## Структура репозитория

```text
teptar/
├─ docs/            # Документация проекта
│  ├─ MVP_PLAN.md          # План MVP
│  ├─ DATABASE_DESIGN.md   # Проектирование БД
│  ├─ ARCHITECTURE.md      # Архитектура и стек
│  └─ ROADMAP.md           # Дорожная карта
├─ backend/         # API-сервер (Node + Express + TS)
│  └─ src/
│     ├─ modules/   # Бизнес-модули (persons, teips, ancestors, export …)
│     ├─ db/        # Схема, миграции, пул соединений
│     ├─ middleware/
│     └─ config/
└─ frontend/        # Веб-клиент (Next.js)
   └─ src/
      ├─ components/
      ├─ features/
      ├─ lib/
      └─ app/
```

## Быстрый старт

См. подробные инструкции в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
# 1. Backend
cd backend
cp .env.example .env        # заполнить доступ к PostgreSQL
npm install
npm run db:init             # создать схему + демо-данные
npm run dev                 # http://localhost:4000

# 2. Frontend
cd ../frontend
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

## Лицензия

Проприетарный проект. © DAKIR / Teptar.
