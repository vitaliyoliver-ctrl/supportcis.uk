# SupportCIS v2 — Архитектура

## Общая схема

```
Браузер
  │
  ├── GET /*           → Node (статика React SPA из app/dist)
  └── /api/*           → Hono-роутер (worker/src/index.ts)
                              │
                              ├── PostgreSQL (таблица kv)
                              ├── Resend (OTP + письма о свапах)
                              ├── Telegram Bot API (webhook свапов)
                              ├── HelpDesk API v1 (тикеты — опционально)
                              └── Supabase Realtime (только фронт, не через Worker)
```

## Структура репозитория

```
v2/                           ← весь исходный код (корень = только CNAME, favicon.svg, _bmad/)
├── app/                      ← React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx           ← роутер + хук useAuth
│   │   ├── pages/            ← страницы по разделам
│   │   │   ├── LoginPage.tsx
│   │   │   ├── HomePage.tsx
│   │   │   ├── SupportPage.tsx
│   │   │   ├── TicketsPage.tsx
│   │   │   ├── BreaksPage.tsx
│   │   │   ├── SalesPage.tsx
│   │   │   ├── ReportPage.tsx / ReportNcPage.tsx
│   │   │   ├── ChampionsPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── schedule/     ← SchedulePage + 10 компонентов
│   │   │   ├── tl/           ← 8 TL-страниц (Main, Data, Daily, FCR, CSAT, Roles, HelpdeskAudit)
│   │   │   └── ops/          ← OpsPage, OpsStructure, OpsPayment
│   │   └── lib/
│   │       ├── scheduleLogic.ts   ← вычисление смен (приоритет: override > dismiss > custom > base)
│   │       ├── shiftDefs.ts       ← единый реестр типов смен
│   │       ├── seed.ts / seedNk.ts ← статический сид сотрудников + паттернов (SG и НК)
│   │       ├── scheduleApi.ts     ← fetch-обёртки для /api/schedule
│   │       ├── helpdeskApi.ts     ← fetch-обёртки для /api/helpdesk/*
│   │       └── types.ts
│   └── vite.config.ts        ← proxy /api/* → worker в dev-режиме
├── worker/
│   ├── src/
│   │   ├── index.ts          ← все маршруты /api/* (Hono, рантайм-независимы)
│   │   ├── server.ts         ← Node-входная точка: статика SPA + API + Postgres
│   │   └── store.ts          ← Store-адаптер (интерфейс + PgStore на таблице kv)
│   └── tools/                ← скрипты миграции данных (kv-export, kv-import-pg, ...)
├── supabase/migrations/
│   ├── 001_schema.sql        ← реляционная схема (employees, shift_types, ...) — задел на будущее
│   └── 002_seed.sql
├── Dockerfile                ← multi-stage: app/dist + dist/server.js → slim Node 20
└── docker-compose.yml        ← сервисы app + db (postgres), volume pgdata
```

## Слои и разделение ответственности

### `worker/src/index.ts` — маршруты
Единственное место, где определены все `/api/*` эндпоинты. Hono-роутер, **рантайм-независим**: не импортирует ни Node, ни Cloudflare API. Взаимодействует с хранилищем только через интерфейс `Store`.

### `worker/src/server.ts` — Node-точка входа
Вся специфика среды: создаёт `PgStore`, инжектирует env-переменные в Hono как `Env`, раздаёт статику React SPA с SPA-фолбэком, регистрирует Telegram-вебхук при старте, чистит протухшие KV-ключи каждые 10 минут.

### `worker/src/store.ts` — адаптер хранилища
Интерфейс `Store { get, put, delete, list }`. Реализация `PgStore` на pg-пуле. Замена БД (Redis/SQLite) = новая реализация `Store`, маршруты не трогаются.

### `app/src/lib/scheduleLogic.ts` — бизнес-логика смен
Вся логика вычисления смены на клиенте. Приоритет:
1. Ручной override (`overrides[name:date]`)
2. Увольнение (`dismissed[name]`)
3. Кастомный паттерн оператора (версионированный: берётся запись с `cycleStart <= date`)
4. Базовый паттерн из сида

## Модель хранения

Одна таблица PostgreSQL:
```sql
CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,          -- JSON-строка
  expires_at TIMESTAMPTZ             -- NULL = вечный, не-NULL = TTL
);
```

### Пространство ключей

| Ключ | Содержимое | TTL |
|---|---|---|
| `roles` | `{ tl[], supervisor[], ops[] }` — email-списки | — |
| `profiles` | `{ email → { name, position, telegram, since } }` | — |
| `schedule:{project}:{month}` | `{ overrides, settings(legacy), version, log }` | — |
| `schedule-settings:{project}` | Глобальные настройки графика (паттерны, порядок, позиции, увольнения) | — |
| `sales` | `{ month → { rows[], dateFrom, dateTo } }` | — |
| `ops-structure` | Массив отделов оргструктуры | — |
| `session:{token}` | `{ email, role }` | 7 дней |
| `otp:{email}` | `{ code, sentAt, attempts }` | 10 минут |
| `swap:{uuid}` | Запись заявки на обмен смены | 60 дней |
| `hd-filters:{email}` | Сохранённые фильтры HelpDesk (до 50 шт.) | — |
| `hd-rl:{email}:{window}` | Rate-limit счётчик HelpDesk (120 req/60s на оператора) | 120 с |
| `hd-audit:{iso}:{id}` | Лог действий в HelpDesk | 90 дней |

> **Важно:** `supabase/migrations/001_schema.sql` описывает нормализованную реляционную схему (employees, shift_types, shift_patterns, schedule_overrides, swaps...). Это задел на будущую миграцию — **текущий рабочий код использует только таблицу `kv`**.

## Аутентификация и авторизация

- OTP: 6-значный код, Resend, 10 мин, 5 попыток, cooldown 50 с
- Сессия: cookie `auth_token` (httpOnly, SameSite=Lax, Secure на https), 7 дней
- Роли: `tl > supervisor > ops > operator`
- Роли читаются из `kv.roles` при каждом входе (не вшиты в сессию — для немедленного действия смены ролей)
- Bootstrap: `OWNER_EMAIL` автоматически получает роль `tl` при первом старте

## Интеграция HelpDesk

Прокси с маскировкой почт: Worker ходит в `api.helpdesk.com` серверным токеном (`HELPDESK_ACCOUNT_ID` + `HELPDESK_PAT` Basic Auth), **рекурсивно заменяет все email-адреса** в JSON-ответе на псевдонимы `client#<hash>` перед отдачей фронту. Rate limit: 120 запросов/мин на оператора. Аудит 90 дней (только для TL).

## Поток обмена смен (свап)

1. Оператор создаёт заявку → `POST /api/swap-request` → запись в `kv`
2. Worker посылает сообщение в Telegram-чат с кнопками ✅/❌
3. TL нажимает кнопку → Telegram присылает callback на `POST /api/tg-webhook`
4. Worker проверяет `TG_WEBHOOK_SECRET`, применяет свап к `schedule:*` в kv, уведомляет email
5. Вебхук регистрируется автоматически при старте (только для публичного https-SITE)

## Развёртывание

```
docker compose up -d --build
```

Multi-stage Dockerfile: стадия 1 — `npm run build` фронта (→ `app/dist`), стадия 2 — esbuild сервера (→ `dist/server.js`), стадия 3 — slim Node 20 runtime.

Переменные окружения (полный список в `v2/.env.example`): `DATABASE_URL`, `SITE`, `OWNER_EMAIL`, `ALLOWED_DOMAINS`, `RESEND_API_KEY`, `RESEND_FROM`, `TG_*`, `HELPDESK_*`.
