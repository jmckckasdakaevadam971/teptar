#!/bin/sh
set -e

# Опциональная инициализация БД при первом запуске.
# Управляется переменной RUN_DB_INIT (1 = применить schema.sql + seed.sql).
# Зависимость от готовности PostgreSQL обеспечивается в docker-compose
# через depends_on: condition: service_healthy.
if [ "$RUN_DB_INIT" = "1" ]; then
  echo "[entrypoint] RUN_DB_INIT=1 → инициализация схемы и демо-данных…"
  node scripts/db-init.js
fi

echo "[entrypoint] Запуск API…"
exec node dist/index.js
