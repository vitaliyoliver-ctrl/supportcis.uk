# SupportCIS v2 — Архитектура

Внутренний портал поддержки. Цель v2 — убрать боль v1 (21 000 строк в 20 HTML без
сборки, 4 разрозненных воркера, хардкод сотрудников) и сделать переносимую версию
для самохостинга на своём сервере.

## Что решили относительно v1

| Боль v1 | Решение v2 |
|---|---|
| Нет сборки, нет компонентов | React 18 + TypeScript + Vite |
| 4 разрозненных воркера на разных `*.workers.dev` | Один Node-процесс (Hono) — фронт + API |
| Привязка к Cloudflare (Workers + KV) | Docker + PostgreSQL, разворачивается где угодно |
| Нет типов | TypeScript на фронте и сервере |

---

## Стек

```
Фронт:   React 18 + TypeScript + Vite   → собирается в app/dist
API:     Hono (рантайм-независимый роутер) на @hono/node-server
Рантайм: Node 20, один контейнер отдаёт и статику SPA, и /api/*
Данные:  PostgreSQL (одна таблица kv: ключ → JSON + TTL)
Перерывы: Supabase Realtime (общий проект компании)
Почта:    Resend (коды входа)
Telegram: бот апрува свапов (вебхук на /api/tg-webhook)
Отчёты:   Power Automate (потоки компании)
Упаковка: Docker + docker-compose (app + postgres)
```

Cloudflare больше не используется. API писался на Hono, который одинаково
работает и на Workers, и на Node — поэтому переезд не потребовал переписывания
маршрутов (см. ниже).

---

## Структура репозитория

```
v2/
├── app/                      ← React SPA (Vite)
│   ├── src/
│   │   ├── pages/            ← schedule, breaks, sales, report, champions, tl/*, ops/*
│   │   ├── pages/schedule/   ← ScheduleSection, StatsBar, PatternModal, SwapModal, ...
│   │   ├── lib/              ← scheduleLogic.ts (расчёт смен), shiftDefs.ts,
│   │   │                       seed.ts / seedNk.ts (сотрудники+паттерны), api.ts
│   │   └── main.tsx
│   └── vite.config.ts
├── worker/                   ← сервер (бывший Cloudflare Worker)
│   ├── src/
│   │   ├── index.ts          ← все маршруты /api/* (Hono), рантайм-независимы
│   │   ├── server.ts         ← Node-входная точка: статика SPA + API + Postgres
│   │   └── store.ts          ← адаптер Store (get/put/delete + TTL) на Postgres
│   └── tools/                ← перенос данных (kv-export, kv-import-pg)
├── Dockerfile                ← multi-stage сборка → slim-рантайм
├── docker-compose.yml        ← app + postgres + volume
├── DEPLOY.md                 ← как развернуть
└── HANDOFF.md                ← памятка DevOps
```

---

## Модель хранения

Cloudflare KV использовался как «ключ → JSON-строка». При переезде этот же
интерфейс реализован на Postgres — одна таблица:

```sql
CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,          -- JSON-строка
  expires_at TIMESTAMPTZ             -- NULL = вечный ключ; не-NULL = TTL
);
```

Адаптер `worker/src/store.ts` (`Store`: `get` / `put` / `delete` + чистка
протухших) инкапсулирует БД — маршруты в `index.ts` про Postgres не знают и не
менялись при переезде. Сменить БД (Redis/SQLite) = новая реализация `Store`.

### Ключи

| Ключ | Содержимое | TTL |
|---|---|---|
| `roles` | `{ tl[], supervisor[], ops[] }` | — |
| `profiles` | карта `email → профиль` | — |
| `schedule:{project}:{month}` | `{ overrides, settings, version, log }` (project = `sg`/`nk`) | — |
| `sales` | данные продаж по месяцам | — |
| `ops-structure` | оргструктура и оплаты | — |
| `session:{token}` | `{ email, role }` | 7 дней |
| `otp:{email}` | код входа + попытки | 10 минут |
| `swap:{id}` | заявка на обмен смен | TTL |

Сотрудники, секции и базовые паттерны — **сид в коде** (`app/src/lib/seed.ts`,
`seedNk.ts`), а не в БД: это статичные справочные данные, редактируются в
исходнике и попадают в сборку. Изменяемое состояние графика (overrides, кастомные
паттерны, лог) хранится в `schedule:*` в Postgres.

---

## Логика вычисления смены (`app/src/lib/scheduleLogic.ts`)

Приоритет: **override → увольнение → кастомный паттерн → базовый паттерн (сид)**.

```ts
function getShift(name, date, overrides, dismissed, operatorPatterns, baseShifts) {
  if (overrides[`${name}:${ds(date)}`]) return overrides[...].type;   // 1. ручная правка
  if (dismissed[name] && ds(date) > dismissed[name]) return 'dismissed'; // 2. уволен
  const p = getPatternShift(name, date, operatorPatterns);            // 3. кастомный паттерн
  if (p !== null) return p;
  return baseShifts[name]?.(date) ?? 'off';                           // 4. базовый цикл
}
```

Паттерны **версионируемые**: смена ротации добавляет запись `{ pattern, cycleStart, v }`
с новой датой начала, старые не удаляются (на прошедшие дни действует прежняя
запись). Активная запись — последняя с `cycleStart <= date`. Пресеты в
`shiftDefs.ts` выровнены так, чтобы `pattern[0]` приходился на начало рабочего
блока (иначе старт цикла с произвольной даты схлопывал первый блок).

---

## Маршруты API (`worker/src/index.ts`)

```
GET   /api/health                       ← liveness для Docker/реверс-прокси
POST  /api/auth/request-code            ← отправка кода (Resend)
POST  /api/auth/verify-code             ← проверка кода → сессия (cookie)
GET   /api/auth/check
POST  /api/auth/logout
GET   /api/schedule?project=&month=     ← блоб графика из Postgres
POST  /api/schedule?project=&month=     ← сохранение (оптимистичная блокировка по version)
POST  /api/swap-request
POST  /api/tg-webhook                   ← апрув/отказ свапа из Telegram
GET   /api/profile      POST /api/profile
GET   /api/profiles     POST /api/roles
GET   /api/sales/data   POST /api/sales/upload
GET   /api/ops/structure POST /api/ops/structure
```

Вход: код на корпоративную почту (домены из `ALLOWED_DOMAINS`) через Resend.
Первый вход с `OWNER_EMAIL` выдаёт роль TL, дальше роли раздаются в интерфейсе.

---

## Развёртывание

Один образ (multi-stage Dockerfile): собирается фронт (`app/dist`), собирается
сервер (esbuild → `dist/server.js`), затем slim-рантайм отдаёт и то, и другое.
`docker compose up -d --build` поднимает `app` + `postgres`. Схема `kv` создаётся
автоматически при старте. TLS/домен — внешним reverse-proxy. Подробно — `DEPLOY.md`.

---

## Правила разработки

1. **Маршруты рантайм-независимы** — вся специфика среды в `server.ts` и `store.ts`.
2. **Изменяемое состояние — в Postgres, справочники (сотрудники/паттерны) — сид в коде.**
3. **Паттерны версионируемые** — новая ротация = новая запись, история не теряется.
4. **Типы смен — единый реестр** (`shiftDefs.ts`), UI не хардкодит конкретику.
5. **Сохранение графика оптимистично** — по полю `version`, конфликт → 409.
