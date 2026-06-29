#!/usr/bin/env bash
# ============================================================================
#  Выравнивание пароля роли БД с актуальным .env.
#
#  Зачем: том PostgreSQL хранит пароль, заданный при ПЕРВОЙ инициализации.
#  Если .env/.secrets позже изменились (ротация секретов, перенос проекта),
#  переменная POSTGRES_PASSWORD в .env перестаёт совпадать с паролем роли
#  внутри тома, и db-init падает с auth_failed (28P01).
#
#  Решение: внутри контейнера db локальный сокет использует trust-аутентификацию,
#  поэтому psql подключается БЕЗ пароля и может выполнить ALTER USER, выставив
#  паролю роли значение из .env. После этого db-init подключается успешно.
#
#  ВАЖНО: это ОТДЕЛЬНЫЙ файл, а не heredoc внутри ssh. В heredoc вложенные
#  `docker compose exec -T` «съедают» поток heredoc и команды теряются —
#  здесь такой проблемы нет, поэтому синхронизация надёжна.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # корень проекта (там, где docker-compose.yml и .env)

if [ ! -f .env ]; then
  echo "[sync-db-password] .env не найден — пропускаю." >&2
  exit 0
fi

set -a; . ./.env; set +a
USR="${POSTGRES_USER:-teptar}"
DB="${POSTGRES_DB:-teptar}"
PW="${POSTGRES_PASSWORD:-}"

if [ -z "$PW" ]; then
  echo "[sync-db-password] POSTGRES_PASSWORD пуст — пропускаю." >&2
  exit 0
fi

echo "[sync-db-password] Жду готовности БД…"
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "$USR" -d "$DB" </dev/null >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "[sync-db-password] Выравниваю пароль роли \"$USR\" с .env…"
# Локальный сокет контейнера = trust-аутентификация, пароль не требуется.
printf "ALTER USER \"%s\" WITH PASSWORD '%s';\n" "$USR" "$PW" \
  | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB"

echo "[sync-db-password] ✅ Пароль роли \"$USR\" синхронизирован с .env."
