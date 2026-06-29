#!/usr/bin/env bash
# ============================================================================
#  Деплой Тептара на сервер через Docker Compose (с доменом и HTTPS).
#
#  Использование:
#     SERVER_USER=root SERVER_HOST=1.2.3.4 ./deploy.sh
#
#  Что делает:
#   1. Проверяет/устанавливает Docker на сервере.
#   2. Копирует проект на сервер (rsync, без node_modules/.next).
#   3. Создаёт .env на сервере, если его нет (из .env.production.example).
#   4. Собирает образы и поднимает БД + инициализацию.
#   5. При первом запуске с доменом — выпускает TLS-сертификат Let's Encrypt.
#   6. Поднимает весь стек (nginx, backend×N, frontend×N, certbot).
#
#  ВАЖНО: до запуска убедитесь, что DNS A-запись вашего домена (и www)
#  указывает на IP сервера, и в ${REMOTE_DIR}/.env заданы DOMAIN и CERTBOT_EMAIL.
# ============================================================================
set -euo pipefail

SERVER_USER="${SERVER_USER:?Задайте SERVER_USER (например root)}"
SERVER_HOST="${SERVER_HOST:?Задайте SERVER_HOST (IP сервера)}"
REMOTE_DIR="${REMOTE_DIR:-/opt/teptar}"
SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"

echo "▶ Деплой на ${SSH_TARGET}:${REMOTE_DIR}"

# 1. Установка Docker при необходимости
echo "▶ Проверяю Docker на сервере…"
ssh "${SSH_TARGET}" 'command -v docker >/dev/null 2>&1 || (curl -fsSL https://get.docker.com | sh)'

# 2. Копирование проекта
echo "▶ Копирую файлы…"
ssh "${SSH_TARGET}" "mkdir -p ${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env' \
  --exclude '*.log' \
  ./ "${SSH_TARGET}:${REMOTE_DIR}/"

# 3. .env на сервере — создаём и АВТОМАТИЧЕСКИ настраиваем (без ручного ввода)
echo "▶ Настраиваю .env на сервере…"
ssh "${SSH_TARGET}" "test -f ${REMOTE_DIR}/.env || cp ${REMOTE_DIR}/.env.production.example ${REMOTE_DIR}/.env"
ssh "${SSH_TARGET}" "chmod +x ${REMOTE_DIR}/deploy/init-letsencrypt.sh || true"

# Параметры домена зашиты в скрипт (можно переопределить через окружение).
DOMAIN="${DOMAIN:-vorhda.ru}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-07dakaev07@mail.ru}"

# Прописываем домен, CORS и email (идемпотентно — безопасно при каждом запуске).
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && \
  sed -i 's|^DOMAIN=.*|DOMAIN=${DOMAIN}|' .env && \
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|' .env && \
  sed -i 's|^CERTBOT_EMAIL=.*|CERTBOT_EMAIL=${CERTBOT_EMAIL}|' .env"

# Секреты (пароль БД и JWT) генерируем ОДИН раз и переиспользуем (файл .secrets),
# чтобы повторные деплои не ломали доступ к уже созданной базе.
echo "▶ Генерирую/применяю секреты…"
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && \
  if [ ! -f .secrets ]; then \
    { echo \"POSTGRES_PASSWORD=\$(openssl rand -hex 24)\"; \
      echo \"JWT_SECRET=\$(openssl rand -hex 48)\"; } > .secrets && chmod 600 .secrets; \
  fi && \
  set -a && . ./.secrets && set +a && \
  sed -i \"s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}|\" .env && \
  sed -i \"s|^JWT_SECRET=.*|JWT_SECRET=\${JWT_SECRET}|\" .env"

# 4. Сборка образов и поднятие БД + инициализация
echo "▶ Собираю образы…"
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose build"

echo "▶ Поднимаю БД и применяю инициализацию…"
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose up -d db"

# Том БД мог быть создан с другим паролем (повторные деплои / ротация .secrets),
# из-за чего db-init падает с auth_failed. Выравниваем пароль роли через
# локальный сокет контейнера (там trust), берём актуальные секреты из .env.
echo "▶ Синхронизирую пароль БД с .env…"
ssh "${SSH_TARGET}" bash -s <<'SYNC_PW' || true
  cd /opt/teptar
  set -a; . ./.env; set +a
  USR="${POSTGRES_USER:-teptar}"; DB="${POSTGRES_DB:-teptar}"; PW="${POSTGRES_PASSWORD}"
  # ВАЖНО: </dev/null у exec, иначе он «съест» поток heredoc и ALTER не выполнится.
  for i in $(seq 1 20); do docker compose exec -T db pg_isready -U "$USR" -d "$DB" </dev/null >/dev/null 2>&1 && break; sleep 2; done
  printf "ALTER USER \"%s\" WITH PASSWORD '%s';\n" "$USR" "$PW" | docker compose exec -T db psql -U "$USR" -d "$DB" >/dev/null 2>&1 || true
SYNC_PW

echo "▶ Применяю инициализацию/миграции…"
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose up db-init"

# 5. Проверяем наличие сертификата; если нет — выпускаем.
echo "▶ Проверяю TLS-сертификат для ${DOMAIN}…"
if ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose run --rm --entrypoint 'test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem' certbot" 2>/dev/null; then
  echo "  ✓ Сертификат уже есть."
else
  echo "  ↪ Сертификата нет — выпускаю через Let's Encrypt…"
  ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && ./deploy/init-letsencrypt.sh"
fi

# 6. Поднимаем весь стек
echo "▶ Поднимаю весь стек…"
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose up -d"

echo "✅ Готово. Откройте: https://${DOMAIN}"
echo "   Логи:    ssh ${SSH_TARGET} 'cd ${REMOTE_DIR} && docker compose logs -f'"
echo "   Статус:  ssh ${SSH_TARGET} 'cd ${REMOTE_DIR} && docker compose ps'"
