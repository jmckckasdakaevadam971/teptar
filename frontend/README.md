# Teptar Frontend

Веб-клиент платформы Тептар. Next.js (App Router) + React + TypeScript + D3.

## Запуск

```bash
cp .env.example .env.local     # указать NEXT_PUBLIC_API_URL (по умолчанию localhost:4000/api)
npm install
npm run dev                    # http://localhost:3000
```

> Backend должен быть запущен (см. ../backend/README.md).

## Структура

```text
src/
├─ app/                        # маршруты (App Router)
│  ├─ layout.tsx               # общий каркас + навигация
│  ├─ globals.css              # стили
│  ├─ page.tsx                 # главная: поиск + общий предок
│  ├─ person/[id]/page.tsx     # карточка человека + древо + экспорт
│  ├─ tree/page.tsx            # переход к древу по ID
│  └─ admin/page.tsx           # очередь модерации (заглушка MVP)
├─ components/                 # переиспользуемые UI-компоненты
│  ├─ TreeView/                # D3-древо с анимацией
│  ├─ PersonCard/
│  └─ SearchBar/
├─ features/                   # фичи
│  ├─ commonAncestor/          # виджет «общий предок»
│  └─ export/                  # кнопки экспорта
└─ lib/
   ├─ api.ts                   # типизированный клиент API
   └─ types.ts                 # общие типы
```

## Ключевые экраны

- **Главная** — поиск людей и виджет поиска общего предка (вирусная фича).
- **Карточка человека** — данные + переключатель «Предки/Потомки» +
  анимированное древо (D3) + экспорт в Excel/Visio.

## Заметки

- Ошибки `Не удается найти модуль "react"/"d3"` в редакторе до `npm install` — нормально.
- Компонент дерева ([TreeView](src/components/TreeView/TreeView.tsx)) строит иерархию из
  плоского списка узлов по `father_id` и анимирует появление связей и узлов.
