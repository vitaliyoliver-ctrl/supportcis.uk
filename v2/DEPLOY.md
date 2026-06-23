# Деплой SupportCIS v2 (Docker, на своём сервере)

Версия **самодостаточна и не привязана к Cloudflare**: запускается одним Node-
процессом в Docker, данные — в **PostgreSQL**. Один контейнер отдаёт и фронт
(собранный React SPA), и API (`/api/*`).

```
v2/
├── app/                — фронт (Vite + React). Сборка → app/dist
├── worker/             — сервер (Hono на @hono/node-server) + хранилище (Postgres)
│   └── src/
│       ├── index.ts    — все маршруты /api/* (рантайм-независимы)
│       ├── server.ts   — Node-входная точка: статика + API + Postgres
│       └── store.ts    — адаптер «ключ→JSON» с TTL (реализация на Postgres)
├── Dockerfile          — multi-stage: фронт + сервер → slim-образ
└── docker-compose.yml  — app + postgres + volume
```

> Раньше версия работала на Cloudflare Workers + KV. Теперь Cloudflare не нужен:
> Workers → Node, KV → Postgres (через тонкий адаптер `store.ts`, маршруты не
> менялись). Всё внешнее (Supabase, Resend, Telegram, Power Automate) — обычные
> HTTP-вызовы и работает как есть.

---

## 1. Быстрый старт

Нужен Docker + Docker Compose.

```bash
cd v2
cp .env.example .env        # заполнить значения (см. таблицу ниже)
docker compose up -d --build
```

Поднимется два контейнера: `db` (Postgres, схема создаётся автоматически при
старте приложения) и `app` (фронт + API на порту `APP_PORT`, по умолчанию 8787).
Проверка: `curl http://localhost:8787/api/health` → `{"ok":true}`.

## 2. Переменные окружения (`.env`)

| Переменная | Что это |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | доступ к Postgres (пароль задать обязательно) |
| `APP_PORT` | порт на хосте (за ним вешается reverse-proxy/TLS) |
| `SITE` | публичный origin портала (CORS + ссылки), напр. `https://portal.company.com` |
| `OWNER_EMAIL` | первый вход с этого адреса → роль TL (bootstrap раздачи ролей) |
| `ALLOWED_DOMAINS` | домены корпоративной почты для входа, через запятую |
| `RESEND_API_KEY` | ключ Resend (письма с кодами входа) |
| `RESEND_FROM` | отправитель, напр. `SupportCIS <noreply@verified-domain>` (домен верифицирован в Resend) |
| `TG_BOT_TOKEN` / `TG_WEBHOOK_SECRET` / `TG_CHAT_ID` | Telegram-бот свапов (опционально) |

`DATABASE_URL` для приложения собирается в `docker-compose.yml` из `POSTGRES_*`
автоматически — отдельно задавать не нужно.

## 3. TLS / домен

Контейнер слушает обычный HTTP на `APP_PORT`. TLS и домен вешаются **вашим
reverse-proxy** (nginx / Traefik / Caddy) перед `app:8787`. Прокси должен
пробрасывать заголовки и `Host`. `SITE` должен совпадать с публичным адресом.

## 4. Telegram webhook (если используются свапы)

У бота один вебхук — направьте его на публичный адрес портала:

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<ваш-домен>/api/tg-webhook" \
  --data-urlencode "secret_token=<TG_WEBHOOK_SECRET>"
```

`secret_token` обязан совпадать с `TG_WEBHOOK_SECRET`.

> ⚠️ Пока параллельно жив старый сайт на том же боте — для теста заведите
> **отдельного** бота, иначе `setWebhook` перетянет боевые аппрувы свапов.

## 5. Перенос данных (актуальные данные → Postgres)

**Владелец отдаёт готовый файл `kv-dump.json`** (выгрузка текущих данных). Поэтому
девопсу доступ к Cloudflare НЕ нужен — только этот файл. Заливаем его в Postgres
контейнера (скрипт уже лежит в репозитории; `pg` есть в образе `app`):

```bash
# из каталога v2/ (контейнеры уже подняты через docker compose up)
docker compose cp worker/tools/kv-import-pg.mjs app:/srv/kv-import-pg.mjs
docker compose cp kv-dump.json app:/srv/kv-dump.json
docker compose exec app node /srv/kv-import-pg.mjs /srv/kv-dump.json \
  "postgres://${POSTGRES_USER:-supportcis}:<POSTGRES_PASSWORD>@db:5432/${POSTGRES_DB:-supportcis}"
```

Выведет список ключей и `Готово. Импортировано: N, пропущено эфемерных: M`. После —
обновить страницу в браузере. Эфемерные ключи (сессии, коды, заявки свапов) не
переносятся — пересоздаются сами. Импорт идемпотентен: можно повторять свежим дампом.

> Если владелец вместо файла даёт доступ к Cloudflare — дамп делается так:
> `cd worker && node tools/kv-export.mjs <CF_NAMESPACE_ID> kv-dump.json`
> (нужен залогиненный `npx wrangler login`). См. `worker/tools/README.md`.

## 6. Supabase (страница «Перерывы»)

Перерывы работают через Supabase Realtime. Это переменные **фронта** (`VITE_*`),
вшиваются **при сборке**, а не в рантайме. По умолчанию зашит общий проект
компании (fallback) — перерывы работают из коробки, ничего настраивать не нужно.

Свой проект Supabase (нужны таблица `bookings` + Realtime) — только пересборкой
образа с build-args:

```bash
docker build -t supportcis \
  --build-arg VITE_SUPABASE_URL=https://<проект>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<ключ> .
```
> (для этого в Dockerfile во фронт-стейдже нужно пробросить ARG → ENV перед
> `npm run build`; по умолчанию не требуется — работает fallback.)

## 7. Локальная разработка (без Docker)

```bash
# Postgres где-то поднят; задаём строку подключения
export DATABASE_URL="postgres://localhost:5432/supportcis"

# фронт (Vite, отдельный порт с проксированием /api — см. vite.config)
cd app && npm install && npm run dev

# сервер
cd ../worker && npm install && npm run dev   # tsx watch src/server.ts
```

Для запуска как в проде: `cd worker && npm run build && STATIC_DIR=../app/dist npm start`.

---

## Проверка после деплоя

1. Открыть адрес портала → страница входа.
2. Войти корпоративным email (домен из `ALLOWED_DOMAINS`) → код придёт через Resend.
3. Первый вход с `OWNER_EMAIL` даёт роль TL.
4. Разделы: график SG, график НК, перерывы, продажи, отчёты, чемпионы,
   TL-инструменты (Data, FCR, Daily, Main, КСАТ, Роли), Ops.

## Что где хранится

| Данные | Где |
|---|---|
| Сессии, коды входа, роли, профили, график (SG/НК), продажи, оргструктура, свапы | **PostgreSQL** (таблица `kv`) |
| Перерывы (Realtime) | **Supabase** (общий проект компании) |
| Письма с кодами | **Resend** |
| Сотрудники/паттерны графика | сид в коде (`app/src/lib/seed.ts`, `seedNk.ts`) |

## Полезное

- Логи: `docker compose logs -f app`
- Состояние: `docker compose ps`
- Бэкап БД: `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`
- Пересборка после обновления кода: `docker compose up -d --build`
- Подключиться к БД: `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB`
