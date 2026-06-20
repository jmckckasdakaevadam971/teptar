# ── Stage 1: сборка TypeScript ───────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: рантайм ─────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Только production-зависимости
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Скомпилированный код + SQL + скрипт инициализации БД
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
# Копируем ВСЕ SQL-файлы (schema, seed, reference_data и расширения),
# иначе db-init.js упадёт с ENOENT при RUN_DB_INIT=1.
COPY src/db/*.sql ./src/db/
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
