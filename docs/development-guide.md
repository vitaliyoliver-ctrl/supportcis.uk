# SupportCIS v2 — Руководство разработчика

## Требования

- Node.js 20+
- PostgreSQL 14+ (или Docker)

## Структура разработки

Два независимых процесса:
- `v2/app/` — Vite dev-сервер (фронт, порт 5173 + proxy /api → worker)
- `v2/worker/` — tsx watch (бэкенд, порт 8787)

## Локальный запуск (без Docker)

### 1. Поднять PostgreSQL

Вариант A — Docker одной командой:
```bash
docker run -d --name supportcis-pg \
  -e POSTGRES_DB=supportcis \
  -e POSTGRES_USER=supportcis \
  -e POSTGRES_PASSWORD=dev \
  -p 5432:5432 postgres:16
```

Вариант B — локальный PostgreSQL. Создать БД `supportcis`.

### 2. Бэкенд

```bash
cd v2/worker
npm install
cp .env.example .env   # или задать переменные вручную
```

Минимальный `.env` для разработки:
```
DATABASE_URL=postgres://supportcis:dev@localhost:5432/supportcis
SITE=http://localhost:5173
OWNER_EMAIL=your@email.com
ALLOWED_DOMAINS=yourdomain.com
# RESEND_API_KEY не нужен — код входа печатается в консоль сервера
```

```bash
npm run dev   # tsx watch src/server.ts → http://localhost:8787
```

При первом запуске схема `kv` создаётся автоматически.

### 3. Фронт

```bash
cd v2/app
npm install
cp .env.example .env   # если есть; можно без него
npm run dev   # Vite → http://localhost:5173
```

Vite проксирует `/api/*` на `http://localhost:8787` (настроено в `vite.config.ts`).

### 4. Войти в систему

Открыть `http://localhost:5173` → ввести email из `ALLOWED_DOMAINS` → код входа появится в консоли `worker` (при отсутствии `RESEND_API_KEY`).

### Dev-режим без бэкенда

```bash
cd v2/app
npm run dev:mock   # VITE_MOCK_API=1 — моковый API (dev-mock-api.ts)
```

---

## Сборка как в проде

```bash
# Сборка фронта
cd v2/app && npm run build   # → app/dist

# Сборка сервера
cd v2/worker && npm run build   # esbuild → dist/server.js

# Запуск
cd v2/worker
STATIC_DIR=../app/dist node dist/server.js
```

---

## Тесты

```bash
# Фронт
cd v2/app
npm test          # vitest run (единоразово)
npm run typecheck # tsc --noEmit

# Бэкенд
cd v2/worker
npm run typecheck
```

Тестовые файлы: `app/src/lib/schedule.test.ts`, `app/src/lib/scheduleLogic.test.ts`.

---

## Docker (полный стек)

```bash
cd v2
cp .env.example .env   # заполнить
docker compose up -d --build
# → app: http://localhost:8787, db: postgres:5432
```

Пересборка после изменений кода:
```bash
docker compose up -d --build
```

---

## Правила разработки

1. **Маршруты рантайм-независимы** — вся специфика среды в `server.ts` и `store.ts`. Новый маршрут — только в `index.ts`.
2. **Изменяемые данные → Postgres (kv); справочники (сотрудники, паттерны) → сид в коде** (`seed.ts`, `seedNk.ts`).
3. **Паттерны версионируемые** — новая ротация = новая запись с `cycleStart`, история не удаляется.
4. **Типы смен — единый реестр** (`shiftDefs.ts`). UI не хардкодит конкретику смен.
5. **Сохранение графика оптимистично** — поле `version`, конфликт → 409 (клиент должен перечитать).
6. **HelpDesk: почты никогда не доходят до браузера** — маскировка в Worker обязательна.

---

## Полезные команды

```bash
# Логи Docker
docker compose logs -f app

# Консоль PostgreSQL
docker compose exec db psql -U supportcis -d supportcis

# Бэкап БД
docker compose exec db pg_dump -U supportcis supportcis > backup.sql

# Экспорт данных из продакшна (если есть доступ к Cloudflare v1)
cd v2/worker && node tools/kv-export.mjs <CF_NAMESPACE_ID> kv-dump.json

# Импорт дампа в PostgreSQL
docker compose cp kv-dump.json app:/srv/kv-dump.json
docker compose cp worker/tools/kv-import-pg.mjs app:/srv/kv-import-pg.mjs
docker compose exec app node /srv/kv-import-pg.mjs /srv/kv-dump.json \
  "postgres://supportcis:<PASSWORD>@db:5432/supportcis"
```
