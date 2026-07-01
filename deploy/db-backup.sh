#!/usr/bin/env bash
# Ежедневный бэкап БД Тептар (запускается на сервере из cron).
#
# Установка на сервере (один раз):
#   chmod +x /opt/teptar/deploy/db-backup.sh
#   crontab -e   →   0 3 * * * /opt/teptar/deploy/db-backup.sh >> /var/log/teptar-backup.log 2>&1
#
# Дампы кладутся в /opt/teptar-db-backups (ВНЕ /opt/teptar, чтобы
# rsync --delete/tar при деплое их не стёр). Хранятся 7 последних дней.

set -euo pipefail

BACKUP_DIR=/opt/teptar-db-backups
COMPOSE_DIR=/opt/teptar
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

cd "$COMPOSE_DIR"

# Данные подключения берём из .env compose-проекта (или дефолты).
DB_USER=$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || true)
DB_NAME=$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- || true)
DB_USER=${DB_USER:-teptar}
DB_NAME=${DB_NAME:-teptar}

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/teptar-$STAMP.sql.gz"

docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUT"

# Проверка: дамп не должен быть подозрительно маленьким (<1 КБ = что-то пошло не так).
SIZE=$(stat -c%s "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  echo "[db-backup] ОШИБКА: дамп подозрительно мал ($SIZE байт): $OUT" >&2
  exit 1
fi

# Ротация: удаляем дампы старше KEEP_DAYS дней.
find "$BACKUP_DIR" -name 'teptar-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "[db-backup] OK: $OUT ($SIZE байт)"
