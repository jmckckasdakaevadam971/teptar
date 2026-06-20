# Деплой Тептара на сервер

Этот документ описывает, как развернуть приложение на сервере с вашим доменом
и HTTPS. Рекомендуемый путь — **Docker Compose** (почти всё одной командой).

---

## Что разворачивается

```text
   ┌──────────────────── сервер (1 IP) ─────────────────────┐
     :80  nginx ─► редирект на HTTPS + ACME-проверка
     :443 nginx ─► /_next/static (кэш)
                 ├► /api ─► backend ×N (Express) ─► PostgreSQL
                 └► /    ─► frontend ×N (Next.js)
            certbot ─► авто-обновление сертификата Let's Encrypt
   └────────────────────────────────────────────────────────┘
```

Наружу открыты только порты 80 и 443 (nginx). БД и API — лишь внутри сети Docker.
Backend и frontend поднимаются в нескольких репликах, чтобы задействовать все ядра.

## Требования к серверу

- ОС: Ubuntu 22.04/24.04 (или любой Linux с Docker).
- RAM: от 2 ГБ (комфортно — 8 ГБ; настройки PostgreSQL рассчитаны на 8 ГБ).
- Открытые порты: 80 и 443 (HTTP/HTTPS) и 22 (SSH).
- **Домен с DNS A-записью**, указывающей на IP сервера (см. ниже).

---

## Шаг 0 — настройте DNS домена

В панели управления доменом (там, где купили) создайте две A-записи:

| Тип | Имя (host) | Значение (IP) |
| --- | --- | --- |
| A | `@` | IP вашего сервера |
| A | `www` | IP вашего сервера |

Подождите, пока записи распространятся (обычно от нескольких минут до пары часов).
Проверить: `dig +short ваш-домен.ru` — должен вернуться IP сервера.

> Без корректной DNS-записи Let's Encrypt не сможет выпустить сертификат.

---

## Путь A — автоматический деплой (с вашего Mac)

```bash
cd ~/Desktop/teptar
SERVER_USER=root SERVER_HOST=ВАШ_IP ./deploy.sh
```

При первом запуске скрипт скопирует проект и создаст `.env`, затем **остановится**
и попросит заполнить его. Откройте и задайте значения:

```bash
ssh root@ВАШ_IP 'nano /opt/teptar/.env'
```

Минимум, что нужно поменять:

- `POSTGRES_PASSWORD` — надёжный пароль БД;
- `JWT_SECRET` — длинная случайная строка;
- `DOMAIN` — ваш домен (например `teptar.ru`, без `http://` и `www`);
- `CERTBOT_EMAIL` — ваш email (уведомления о сертификате);
- `CORS_ORIGIN` — `https://ваш-домен.ru`.

Затем запустите деплой ещё раз — он соберёт образы, инициализирует БД,
**выпустит TLS-сертификат** и поднимет весь стек:

```bash
SERVER_USER=root SERVER_HOST=ВАШ_IP ./deploy.sh
```

Готово — откройте `https://ваш-домен.ru`.

---

## Путь B — вручную на сервере

```bash
# 1. Подключиться и установить Docker
ssh root@ВАШ_IP
curl -fsSL https://get.docker.com | sh

# 2. Скопировать проект (с Mac):
#    rsync -az --exclude node_modules --exclude .next ./ root@ВАШ_IP:/opt/teptar/
mkdir -p /opt/teptar && cd /opt/teptar

# 3. Настроить окружение
cp .env.production.example .env
nano .env     # DOMAIN, CERTBOT_EMAIL, POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGIN

# 4. Собрать образы и инициализировать БД
docker compose build
docker compose up -d db
docker compose up db-init          # применит схему + справочник и завершится

# 5. Выпустить сертификат (первый раз) и поднять весь стек
chmod +x deploy/init-letsencrypt.sh
./deploy/init-letsencrypt.sh
docker compose up -d

# 6. Проверить
docker compose ps
curl -k https://localhost/api/health
```

Откройте `https://ваш-домен.ru`.

---

## Управление

```bash
cd /opt/teptar

docker compose ps                  # статус
docker compose logs -f             # логи всех сервисов
docker compose logs -f backend     # логи API
docker compose restart             # перезапуск
docker compose up -d --build       # обновить после изменения кода
docker compose down                # остановить (данные БД сохранятся в volume)
docker compose down -v             # остановить и УДАЛИТЬ данные БД
```

### Масштабирование под нагрузку

Число процессов задаётся в `.env` (`BACKEND_REPLICAS`, `FRONTEND_REPLICAS`).
Для 4 vCPU оптимально `2 + 2`. После изменения:

```bash
docker compose up -d
```

## Важные заметки

- **Инициализация БД безопасна для прода.** Сервис `db-init` создаёт схему
  только если БД пустая, а при последующих запусках обновляет лишь справочник
  (идемпотентно) — пользовательские данные не стираются.
- **Демо-данные**: чтобы при первой инициализации загрузить тестовое древо,
  поставьте `SEED_DEMO=1` в `.env`. Для чистого старта оставьте `0`.
- **Полный сброс БД** (осторожно, стирает всё): `FORCE_RESET=1` → один запуск
  `docker compose up db-init` → верните `0`.
- **HTTPS и сертификат**: первый выпуск — `deploy/init-letsencrypt.sh`.
  Обновление — автоматически сервисом `certbot` (каждые 12 часов).
  Для отладки без лимитов Let's Encrypt поставьте `CERTBOT_STAGING=1`,
  получите тестовый сертификат, затем верните `0` и перевыпустите.
- **Кэш**: nginx кэширует публичные GET-ответы API на 30 с и статику Next.js.
  Запросы с авторизацией не кэшируются. Заголовок ответа `X-Cache-Status`
  показывает `HIT`/`MISS`.

## Траблшутинг

| Симптом | Решение |
| --- | --- |
| Сертификат не выпускается | Проверьте DNS: `dig +short ВАШ_ДОМЕН` должен вернуть IP сервера; порты 80/443 открыты |
| `NET::ERR_CERT` в браузере | Если включали `CERTBOT_STAGING=1` — верните `0` и перевыпустите сертификат |
| backend перезапускается | `docker compose logs backend` — обычно БД ещё не готова, подождите |
| Пустые данные | Запустите `docker compose up db-init`; для демо — `SEED_DEMO=1` |
| 502 от nginx | backend/frontend ещё собираются/стартуют; проверьте `docker compose ps` |
| Реплики не создаются | Нужна свежая версия Docker Compose v2; либо `docker compose up -d --scale backend=2 --scale frontend=2` |

