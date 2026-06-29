# SupportCIS v2 — Руководство по деплою

Полная инструкция также доступна в исходных файлах: [v2/DEPLOY.md](../v2/DEPLOY.md) и [v2/HANDOFF.md](../v2/HANDOFF.md).

## Требования

- Docker + Docker Compose
- Домен + reverse-proxy с TLS (nginx / Traefik / Caddy)
- Файл `kv-dump.json` с данными (передаёт владелец)

## Переменные окружения (`v2/.env`)

| Переменная | Описание | Обязательна |
|---|---|---|
| `POSTGRES_USER` | Пользователь PostgreSQL | Да |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | Да |
| `POSTGRES_DB` | Имя базы данных | Да |
| `APP_PORT` | Порт контейнера (по умолчанию `8787`) | Нет |
| `SITE` | Публичный origin (`https://...`). Используется для CORS и Telegram-вебхука | Да |
| `OWNER_EMAIL` | Email первого TL (bootstrap ролей) | Да |
| `ALLOWED_DOMAINS` | Домены корп. почты через запятую | Да |
| `RESEND_API_KEY` | Ключ Resend (OTP + уведомления о свапах) | Да |
| `RESEND_FROM` | Отправитель (`Name <email>`, домен верифицирован в Resend) | Да |
| `TG_BOT_TOKEN` | Telegram Bot Token (для свапов) | Нет |
| `TG_WEBHOOK_SECRET` | Секрет вебхука Telegram | Нет |
| `TG_CHAT_ID` | ID чата для сообщений бота | Нет |
| `HELPDESK_ACCOUNT_ID` | Account ID HelpDesk (Basic-auth логин) | Нет |
| `HELPDESK_PAT` | Personal Access Token HelpDesk (Basic-auth пароль) | Нет |

`DATABASE_URL` собирается в `docker-compose.yml` автоматически из `POSTGRES_*`.

## Деплой

```bash
cd v2
cp .env.example .env    # заполнить значения
docker compose up -d --build
```

Два контейнера: `db` (PostgreSQL) и `app` (фронт + API на `APP_PORT`).

Проверка: `curl http://localhost:8787/api/health` → `{"ok":true}`

## TLS / домен

Контейнер `app` слушает HTTP. Повесить перед ним reverse-proxy с TLS. `SITE` в `.env` должен совпадать с публичным HTTPS-адресом.

## Загрузить данные

```bash
docker compose cp kv-dump.json app:/srv/kv-dump.json
docker compose cp worker/tools/kv-import-pg.mjs app:/srv/kv-import-pg.mjs
docker compose exec app node /srv/kv-import-pg.mjs /srv/kv-dump.json \
  "postgres://${POSTGRES_USER}:<POSTGRES_PASSWORD>@db:5432/${POSTGRES_DB}"
```

Импорт идемпотентен. Эфемерные ключи (сессии, OTP, свапы) не переносятся.

## Telegram-вебхук (опционально)

Вебхук регистрируется **автоматически** при старте приложения, если задан `TG_BOT_TOKEN` и `SITE` начинается с `https://`.

Ручная регистрация:
```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<домен>/api/tg-webhook" \
  --data-urlencode "secret_token=<TG_WEBHOOK_SECRET>"
```

⚠️ Один бот — один вебхук. Если параллельно жив старый сайт на том же боте — при тестировании заведите отдельного бота.

## Supabase (перерывы)

Используется общий корпоративный проект. Зашит во фронт как fallback — ничего настраивать не нужно. Свой Supabase — только пересборкой образа с build-args (см. `v2/DEPLOY.md §6`).

## Проверка после деплоя

1. Открыть портал → страница входа
2. Войти через email из `ALLOWED_DOMAINS` → код придёт на почту (Resend)
3. Первый вход с `OWNER_EMAIL` → роль TL
4. Пройтись по разделам: график SG/НК, перерывы, продажи, отчёты, чемпионы, тикеты, TL-инструменты, Ops

## Обслуживание

```bash
# Логи
docker compose logs -f app

# Состояние
docker compose ps

# Бэкап БД
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Обновление кода
git pull && docker compose up -d --build

# Консоль БД
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB
```
