#!/usr/bin/env bash
# ============================================================================
#  Первый выпуск TLS-сертификата Let's Encrypt для Тептара.
#  Запускать ОДИН раз на сервере, после того как:
#    • DNS A-запись домена указывает на IP сервера;
#    • заполнен .env (DOMAIN, CERTBOT_EMAIL);
#    • образы собраны (docker compose build).
#
#  Использование (на сервере, в каталоге проекта):
#     ./deploy/init-letsencrypt.sh
#
#  Идея: nginx не стартует со ссылкой на несуществующий сертификат,
#  поэтому сначала кладём временный самоподписанный, поднимаем nginx,
#  затем получаем настоящий сертификат и перезагружаем nginx.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Загружаем переменные окружения из .env.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DOMAIN="${DOMAIN:?Задайте DOMAIN в .env (например teptar.ru)}"
EMAIL="${CERTBOT_EMAIL:?Задайте CERTBOT_EMAIL в .env (для уведомлений Let's Encrypt)}"
STAGING="${CERTBOT_STAGING:-0}"   # 1 = тестовый сервер LE (без лимитов), 0 = боевой

CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

echo "▶ Домен: ${DOMAIN}, email: ${EMAIL}, staging: ${STAGING}"

# 1. Временный самоподписанный сертификат, чтобы nginx смог стартовать.
echo "▶ Создаю временный сертификат…"
docker compose run --rm --entrypoint "\
  sh -c 'mkdir -p ${CERT_PATH} && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout ${CERT_PATH}/privkey.pem \
    -out ${CERT_PATH}/fullchain.pem \
    -subj \"/CN=${DOMAIN}\"'" certbot

# 2. Поднимаем nginx (он отдаёт ACME-challenge по HTTP).
echo "▶ Запускаю nginx…"
docker compose up -d nginx
sleep 5

# 3. Удаляем временный и запрашиваем настоящий сертификат (webroot).
echo "▶ Удаляю временный сертификат и запрашиваю настоящий…"
docker compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/${DOMAIN} \
         /etc/letsencrypt/archive/${DOMAIN} \
         /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot

STAGING_FLAG=""
if [ "${STAGING}" = "1" ]; then STAGING_FLAG="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    ${STAGING_FLAG} \
    -d ${DOMAIN} -d www.${DOMAIN} \
    --email ${EMAIL} --rsa-key-size 4096 \
    --agree-tos --no-eff-email --non-interactive" certbot

# 4. Перезагружаем nginx с настоящим сертификатом.
echo "▶ Перезагружаю nginx…"
docker compose exec nginx nginx -s reload || docker compose restart nginx

echo "✅ Сертификат выпущен. Откройте: https://${DOMAIN}"
echo "   Автообновление выполняет сервис certbot (каждые 12 часов)."
