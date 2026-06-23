# SupportCIS v2 — памятка для передачи (DevOps)

Внутренний портал поддержки: **один Node-контейнер** отдаёт и фронт (React SPA
из `app/dist`), и API (`/api/*`). Данные — в **PostgreSQL**. Cloudflare не нужен.

Версия самодостаточна: в репозитории нет привязок к чужому аккаунту — всё
специфичное для окружения задаётся переменными в `.env`.

## Поднять с нуля

Полная инструкция — **`DEPLOY.md`**. Кратко:

```bash
cd v2
cp .env.example .env        # POSTGRES_PASSWORD, SITE, OWNER_EMAIL, RESEND_*, ...
docker compose up -d --build
```

Поднимется `db` (Postgres, схема создаётся сама) + `app` (фронт + API, порт 8787).
TLS/домен — вашим reverse-proxy перед `app:8787`. Проверка:
`curl http://localhost:8787/api/health`.

## Архитектура

- `worker/src/index.ts` — маршруты `/api/*` на Hono (рантайм-независимы).
- `worker/src/server.ts` — Node-входная точка: `@hono/node-server`, раздача
  статики SPA + API, инициализация Postgres.
- `worker/src/store.ts` — адаптер `Store` (`get`/`put`/`delete` + TTL) на одной
  таблице `kv(key, value, expires_at)`. Сменить БД — достаточно новой реализации
  `Store`, маршруты не трогаются.
- `Dockerfile` — multi-stage (сборка фронта + сервера → slim-рантайм).

## Подставить под своё окружение

- **Домены входа** — `ALLOWED_DOMAINS` (по умолчанию `velvix.org,gameup.club`).
- **Bootstrap-владелец** — `OWNER_EMAIL`: первый вход даёт роль TL, дальше роли
  раздаются из интерфейса (TL → «Управление ролями»).
- **Resend** — `RESEND_FROM` на домене, верифицированном в Resend.
- **Telegram-бот свапов** — один вебхук; направить на `https://<домен>/api/tg-webhook`
  (`DEPLOY.md` §4). Пока жив старый сайт — для теста отдельный бот.
- **Supabase (перерывы)** — общий проект компании зашит как fallback во фронте,
  работает из коробки. Свой проект — только пересборкой с build-args (`DEPLOY.md` §6).
- **Power Automate (отчёты)** — URL потоков компании в `app/src/pages/ReportPage.tsx`,
  `ReportNcPage.tsx`, `tl/TLDataPage.tsx`. Пересоздадут потоки — обновить URL там.
- **Админы перерывов** — список email в `app/src/pages/BreaksPage.tsx` (`ADMINS`).

## Перенос данных (с Cloudflare KV → Postgres)

См. `worker/tools/README.md`:
1. `node tools/kv-export.mjs <CF_NAMESPACE_ID> kv-dump.json` (где есть доступ к KV).
2. `node tools/kv-import-pg.mjs tools/kv-dump.json "<DATABASE_URL>"`.

## Состояние

- Сборка/типы/тесты зелёные: в `app/` — `npm run typecheck`, `npm test`,
  `npm run build`; в `worker/` — `npm run typecheck`, `npm run build`.
- Перенесены и выверены: график **SG + НК**, перерывы, продажи, чемпионы,
  отчёты (SG/НК), TL-инструменты (Data, FCR, Daily, Main, КСАТ, Роли),
  Ops (структура, оплаты), профили/роли, вход.
- Адаптер Postgres покрыт smoke-тестом (put/get/upsert/delete/TTL/sweep), сервер
  проверен end-to-end (health, SPA, статика, API-auth, 404).
