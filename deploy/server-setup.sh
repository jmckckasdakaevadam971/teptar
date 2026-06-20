#!/usr/bin/env bash
# ============================================================================
#  Тептар — установка ПРЯМО НА СЕРВЕРЕ (без вашего Mac и SSH).
#
#  Когда использовать: код уже лежит на сервере (например, после `git clone`),
#  и вы запускаете команды в веб-консоли reg.cloud или по SSH на самом сервере.
#
#  Запуск (находясь в каталоге проекта на сервере):
#     bash deploy/server-setup.sh
#
#  Скрипт сам:
#   1. Ставит Docker (+ compose) и git/openssl при необходимости.
#   2. Создаёт и настраивает .env (домен, CORS, email).
#   3. Генерирует пароли БД и JWT один раз (.secrets) и переиспользует их.
#   4. Собирает образы, создаёт БД и справочник (без демо-людей).
#   5. Выпускает TLS-сертификат Let's Encrypt и поднимает весь стек.
#
#  Параметры по умолчанию (можно переопределить переменными окружения):
#     DOMAIN, CERTBOT_EMAIL
#
#  ВАЖНО: DNS A-записи домена (@ и www) должны указывать на этот сервер.
# ============================================================================
set -euo pipefail

# --- Параметры (зашиты значения проекта, переопределяются через окружение) ---
DOMAIN="${DOMAIN:-vorhda.ru}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-07dakaev07@mail.ru}"

# Переходим в корень проекта (на уровень выше каталога deploy).
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
echo "▶ Каталог проекта: ${PROJECT_DIR}"
echo "▶ Домен: ${DOMAIN} | email: ${CERTBOT_EMAIL}"

# --- 1. Зависимости системы -------------------------------------------------
echo "▶ Проверяю системные пакеты…"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl git openssl ca-certificates
fi

echo "▶ Проверяю Docker…"
if ! command -v docker >/dev/null 2>&1; then
  echo "  ↪ Устанавливаю Docker…"
  curl -fsSL https://get.docker.com | sh
fi

# Плагин docker compose (v2). На большинстве систем ставится вместе с Docker.
if ! docker compose version >/dev/null 2>&1; then
  echo "  ↪ Доустанавливаю docker compose plugin…"
  apt-get install -y docker-compose-plugin || true
fi

systemctl enable --now docker 2>/dev/null || true

# --- 2. Файл окружения ------------------------------------------------------
echo "▶ Настраиваю .env…"
[ -f .env ] || cp .env.production.example .env

sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" .env
sed -i "s|^CERTBOT_EMAIL=.*|CERTBOT_EMAIL=${CERTBOT_EMAIL}|" .env

# --- 3. Секреты (генерируем один раз, переиспользуем) -----------------------
echo "▶ Применяю секреты…"
if [ ! -f .secrets ]; then
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "JWT_SECRET=$(openssl rand -hex 48)"
  } > .secrets
  chmod 600 .secrets
  echo "  ↪ Сгенерированы новые пароли (сохранены в .secrets)."
fi
set -a; . ./.secrets; set +a
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env

# --- 4. Сборка и инициализация БД ------------------------------------------
echo "▶ Собираю образы (это занимает несколько минут)…"
docker compose build

echo "▶ Поднимаю БД и применяю схему + справочник…"
docker compose up -d db
docker compose up db-init

# --- 5. TLS-сертификат ------------------------------------------------------
chmod +x deploy/init-letsencrypt.sh
if docker compose run --rm --entrypoint "test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem" certbot 2>/dev/null; then
  echo "▶ Сертификат уже есть — пропускаю выпуск."
else
  echo "▶ Выпускаю TLS-сертификат Let's Encrypt…"
  ./deploy/init-letsencrypt.sh
fi

# --- 6. Запуск всего стека --------------------------------------------------
echo "▶ Поднимаю весь стек…"
docker compose up -d

echo ""
echo "✅ Готово! Откройте: https://${DOMAIN}"
echo "   Пароли БД/JWT сохранены в: ${PROJECT_DIR}/.secrets"
echo "   Статус:  docker compose ps"
echo "   Логи:    docker compose logs -f"
