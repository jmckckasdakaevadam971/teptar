# Project Handoff — настройка окружения VS Code (Тептар)

> Что было сделано в этой сессии по подготовке рабочего окружения VS Code
> для проекта **Тептар (Vorhda)** — генеалогическая платформа (Next.js + Express/TS + PostgreSQL + Docker).
> Цель: подобрать и установить лучшие расширения под стек проекта и настроить их, чтобы редактор «лучше работал».

---

## 1. Установленные расширения (20 шт.)

Все подобраны под реальный стек проекта (см. структуру в основном handoff).

**Качество кода / TypeScript**

- `dbaeumer.vscode-eslint` — ESLint
- `esbenp.prettier-vscode` — Prettier (форматирование)
- `usernamehw.errorlens` — ошибки/предупреждения прямо в строке
- `yoavbls.pretty-ts-errors` — читаемые ошибки TypeScript

**Frontend: Next.js / React / Tailwind**

- `bradlc.vscode-tailwindcss` — автодополнение Tailwind
- `csstools.postcss` — поддержка PostCSS
- `formulahendry.auto-rename-tag` — авто-переименование парных тегов
- `steoates.autoimport` — авто-импорты

**Backend: база данных / окружение**

- `mtxr.sqltools` + `mtxr.sqltools-driver-pg` — подключение к PostgreSQL, запросы, просмотр схемы
- `mikestead.dotenv` — подсветка `.env`

**Docker / деплой / Nginx / shell**

- `ms-azuretools.vscode-containers`, `ms-azuretools.vscode-docker` — Docker
- `timonwong.shellcheck` — линтер shell-скриптов (`deploy.sh` и др.)
- `raynigon.nginx-formatter` (+ подтянулся `ahmadalli.vscode-nginx-conf`) — Nginx

**Git**

- `eamodio.gitlens` — история, blame, авторство

**Утилиты / навигация**

- `christian-kohler.path-intellisense`, `christian-kohler.npm-intellisense`
- `streetsidesoftware.code-spell-checker` (+ `-russian`) — орфография en/ru

> Уже стояли ранее: `saoudrizwan.claude-dev` (Cline), русский языковой пакет, Dart/Flutter, dotnet-runtime — не трогались.

### Не установилось

- `ms-ossdata.vscode-pgsql` (официальный PostgreSQL от Microsoft) — не ставится в текущей среде.
  **PostgreSQL полностью покрыт связкой SQLTools + PG-драйвер**, поэтому этот ID убран из рекомендаций.

---

## 2. Изменённые файлы

### `.vscode/extensions.json`

Содержит финальный рабочий список рекомендаций (без неустанавливаемого `ms-ossdata.vscode-pgsql`).
Команда увидит подсказку «установить рекомендованные» при открытии проекта.

### `.vscode/settings.json`

Дополнен (существующая база сохранена):

- **Автоформат при сохранении** + `source.fixAll.eslint` (frontend + backend).
- **Tailwind**: автодополнение классов в `.tsx` и внутри `cn()`/`clsx()` (`tailwindCSS.includeLanguages`, `editor.quickSuggestions.strings = on`).
- **Орфография**: словарь доменных терминов (`teptar`, `vorhda`, `tukhums`, `teips`, `nekyi`, `gars`, `trgm`, `certbot`, `Timeweb`, `scrypt`, `lucide`, `pgdata` …) — убирает ложные подчёркивания.
- **Производительность**: `files.watcherExclude` и `search.exclude` для `node_modules`, `.next`, `dist`, `.deploy-tmp`, `package-lock.json`.
- **Чистка**: устаревшие ключи `typescript.preferences.importModuleSpecifier` и `typescript.updateImportsOnFileMove.enabled` заменены на актуальные `js/ts.*`.
- Ошибок в файле после правок нет.

---

## 3. Что нужно сделать пользователю

1. Выполнить **Developer: Reload Window** в VS Code, чтобы все расширения активировались.
2. (Опционально) Настроить подключение SQLTools к БД `teptar` для работы со схемой/данными.

---

## 4. Заметки по проекту (для контекста)

- Backend — **ESM**, импорты оканчиваются на `.js` даже для `.ts`. Настройки расширений это **не ломают**.
- Тестов в проекте нет (можно добавить Vitest/Jest позже).
- Страница `frontend/src/app/my/page.tsx` намеренно очищена — строится заново (см. основной PROJECT_HANDOFF).

---

_Конец handoff по настройке окружения. Изменения затронули только папку `.vscode/` — код проекта не менялся._
