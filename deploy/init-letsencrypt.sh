#!/usr/bin/env bash
# ============================================================================
#  Первый выпуск TLS-сертификата Lets Encrypt для Тептара.
#  Запускать ОДИН раз на сервере, после того как:
#    • DNS A-запись домена указывает на IP сервера;
#    • заполнен .env (DOMAIN, CERTBOT_EMAIL);
#    • образы собраны (docker compose build).
#
#  Использование (на сервере, в каталоге проекта):
#     ./deploy/init-letsencrypt.sh
#
#  Идея: nginx не стартует со ссылкой на несуществующий сертификат, поэтому
#  сначала кладём временный самоподписанный, поднимаем nginx, затем пытаемся
#  получить настоящий. ВАЖНО: при неудаче (DNS ещё не настроен) скрипт НЕ падает —
#  сайт остаётся доступен на временном сертификате, повторите позже.
# ============================================================================
# Намеренно без -e: ошибку выпуска сертификата обрабатываем сами, не роняя деплой.
set -uo pipefail

cd "$(dirname "$0")/.."

# Загружаем переменные окружения из .env.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DOMAIN="${DOMAIN:?Задайте DOMAIN в .env (например teptar.ru)}"
EMAIL="${CERTBOT_EMAIL:?Задайте CERTBOT_EMAIL в .env (email для уведомлений)}"
STAGING="${CERTBOT_STAGING:-0}"   # 1 = тестовый сервер LE (без лимитов), 0 = боевой

CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

echo "▶ Домен: ${DOMAIN}, email: ${EMAIL}, staging: ${STAGING}"

# Создать временный самоподписанный сертификат (чтобы nginx мог стартовать).
make_dummy_cert() {
  docker compose run --rm --entrypoint sh certbot -c "mkdir -p ${CERT_PATH} && openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout ${CERT_PATH}/privkey.pem -out ${CERT_PATH}/fullchain.pem -subj /CN=${DOMAIN}"
}

# Если настоящий сертификат уже выпускался ранее (есть renewal-конфиг) — не трогаем,
# просто поднимаем nginx. Это делает повторный запуск безопасным.
if docker compose run --rm --entrypoint sh certbot -c "test -f /etc/letsencrypt/renewal/${DOMAIN}.conf"; then
  echo "▶ Сертификат уже выпущен ранее — поднимаю nginx."
  docker compose up -d nginx
  echo "✅ Готово (init-letsencrypt)."
  exit 0
fi

# 1. Временный самоподписанный сертификат, чтобы nginx смог стартовать.
echo "▶ Создаю временный сертификат…"
make_dummy_cert

# 2. Поднимаем nginx (он отдаёт ACME-challenge по HTTP).
echo "▶ Запускаю nginx…"
docker compose up -d nginx
sleep 5

# 3. Удаляем временный и запрашиваем настоящий сертификат (webroot).
echo "▶ Удаляю временный сертификат и запрашиваю настоящий…"
docker compose run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/${DOMAIN} /etc/letsencrypt/archive/${DOMAIN} /etc/letsencrypt/renewal/${DOMAIN}.conf"

STAGING_FLAG=""
if [ "${STAGING}" = "1" ]; then STAGING_FLAG="--staging"; fi

if docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot ${STAGING_FLAG} -d ${DOMAIN} -d www.${DOMAIN} --email ${EMAIL} --rsa-key-size 4096 --agree-tos --no-eff-email --non-interactive; then
  # 4a. Успех — перезагружаем nginx с настоящим сертификатом.
  echo "✅ Сертификат выпущен. Перезагружаю nginx…"
  docker compose exec nginx nginx -s reload 2>/dev/null || docker compose restart nginx
  echo "✅ HTTPS активен. Откройте: https://${DOMAIN}"
  echo "   Автообновление выполняет сервис certbot (каждые 12 часов)."
else
  # 4b. Неудача (обычно DNS ещё не указывает на сервер) — НЕ роняем деплой:
  #     восстанавливаем временный сертификат, сайт остаётся доступен.
  echo "⚠ Сертификат Lets Encrypt не выдан."
  echo "  Проверьте, что A-записи ${DOMAIN} и www.${DOMAIN} указывают на этот сервер,"
  echo "  а порты 80 и 443 открыты. Сейчас сайт поднимется на ВРЕМЕННОМ сертификате."
  make_dummy_cert
  docker compose restart nginx
  echo "  После настройки DNS повторите:  cd /opt/teptar && ./deploy/init-letsencrypt.sh"
fi

echo "▶ Готово (init-letsencrypt)."
