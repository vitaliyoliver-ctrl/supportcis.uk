# SupportCIS v2 — Архитектура

## Проблемы v1, которые решаем

| Боль | Причина | Решение |
|---|---|---|
| График — хардкод, который перетирается API | Люди/паттерны в JS, overrides в KV | Всё в Postgres |
| 21 000 строк в 20 HTML-файлах | Нет сборки, нет компонентов | React + Vite |
| 4 разрозненных воркера | Органический рост | Один CF Worker как API |
| Добавить сотрудника = редактировать исходник | EMPLOYEES захардкожен | Таблица employees |
| Нет типов | Ванильный JS | TypeScript |

---

## Технологический стек

```
Фронт: React 18 + TypeScript + Vite
UI:    Tailwind CSS + shadcn/ui (или ручные компоненты — решить при старте UI)
Таблицы/грид: TanStack Table v8
Деплой фронта: Cloudflare Pages

API:   Один Cloudflare Worker (Hono или raw fetch)
Сессии: Cloudflare KV (auth_token → {email, role}) — не трогаем
Данные: Supabase Postgres

Почта:    Resend (без изменений)
Telegram: бот апрува свапов (без изменений)
Teams:    Webhook (без изменений)
```

---

## Структура репозитория

```
supportcis-v2/           ← новый репо (рабочий GitHub аккаунт)
├── app/                 ← React SPA (Vite)
│   ├── src/
│   │   ├── pages/       ← маршруты: schedule, breaks, sales, report, tl/*, ops/*
│   │   ├── components/  ← переиспользуемые: ShiftCell, ScheduleGrid, SwapModal...
│   │   ├── lib/         ← api.ts, schedule.ts (логика вычисления смен), types.ts
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts
├── worker/              ← Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts     ← роутер (Hono)
│   │   ├── auth.ts      ← send-code, verify-code, check, logout, roles
│   │   ├── schedule.ts  ← GET/POST /api/schedule
│   │   ├── swap.ts      ← swap-request, tg-webhook
│   │   ├── profile.ts
│   │   └── sales.ts
│   └── wrangler.toml
├── supabase/
│   └── migrations/      ← SQL-миграции
└── ARCHITECTURE.md
```

---

## Схема базы данных (Supabase Postgres)

### employees
```sql
CREATE TABLE employees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,          -- "Oliver", "Jordan"  (display name)
  email        TEXT NOT NULL,
  position     TEXT NOT NULL DEFAULT '',
  hired_at     DATE,
  dismissed_at DATE,                           -- NULL = работает
  hours        SMALLINT,                       -- персональные часы (NULL = из типа смены)
  section_id   UUID REFERENCES sections(id),
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### sections
```sql
CREATE TABLE sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,   -- 'regular_support', 'vip_support', 'management', 'qa'
  label      TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'blue',
  sort_order INT NOT NULL DEFAULT 0
);
```

### shift_types
```sql
-- Таблица-реестр типов смен (заменяет SHIFT_DEFS в JS)
CREATE TABLE shift_types (
  key        TEXT PRIMARY KEY,  -- 'morning', 'evening', 'off', 'super_day', ...
  label      TEXT NOT NULL,
  category   TEXT NOT NULL,     -- 'Regular', 'VIP', 'Sup', 'Mgmt', 'Other'
  hours      SMALLINT NOT NULL DEFAULT 0,
  win_start  SMALLINT,          -- начало окна в часах (может быть NULL для 'off')
  win_end    SMALLINT,          -- конец (>24 = переходит на след. день)
  is_night   BOOLEAN NOT NULL DEFAULT false,
  is_extra   BOOLEAN NOT NULL DEFAULT false,
  base_key   TEXT REFERENCES shift_types(key),  -- для isExtra: ссылка на базовый тип
  givable    BOOLEAN NOT NULL DEFAULT false,
  legacy     BOOLEAN NOT NULL DEFAULT false
);
```

### shift_patterns
```sql
-- Версионируемые циклические паттерны (заменяет BASE_PATTERNS + operatorPatterns v2)
CREATE TABLE shift_patterns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_start  DATE NOT NULL,
  pattern      TEXT[] NOT NULL,   -- ['morning','off','off','evening','evening','off','off','morning']
  priority     INT NOT NULL DEFAULT 0,  -- выше = важнее при перекрытии
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   TEXT,
  UNIQUE(employee_id, cycle_start)
);
```

### schedule_overrides
```sql
-- Ручные правки и автоматические (свапы, больничные, отпуска)
-- Заменяет scheduleOverrides в KV
CREATE TABLE schedule_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  shift_key    TEXT NOT NULL REFERENCES shift_types(key),
  extra_events JSONB NOT NULL DEFAULT '[]',  -- [{type, hours, range, swapWith, ...}]
  custom_hours SMALLINT,
  note         TEXT,
  edited_by    TEXT,
  edited_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Быстрый запрос «все overrides за месяц»
CREATE INDEX ON schedule_overrides (date);
```

### swaps
```sql
CREATE TABLE swaps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  giver_id         UUID NOT NULL REFERENCES employees(id),
  recipient_id     UUID NOT NULL REFERENCES employees(id),
  date             DATE NOT NULL,
  shift_key        TEXT NOT NULL REFERENCES shift_types(key),
  shift_label      TEXT,
  range            TEXT,    -- '09:00–21:00'
  hours            SMALLINT NOT NULL,
  with_lunch       BOOLEAN NOT NULL DEFAULT false,
  win              SMALLINT[],  -- [start_h, end_h] или NULL
  comment          TEXT,
  tg_message_id    BIGINT,
  decided_by       TEXT,
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

### schedule_log
```sql
-- Аудит-лог изменений (заменяет log[] в KV)
CREATE TABLE schedule_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at          TIMESTAMPTZ DEFAULT now(),
  by          TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_name TEXT,
  month       TEXT         -- '2026-07' для быстрой фильтрации
);
```

---

## Логика вычисления смены (schedule.ts)

```typescript
// Вместо getShift() в 4000-строчном файле:
function resolveShift(employeeId: string, date: Date, overrides: Map<string, Override>, patterns: ShiftPattern[]): string {
  // 1. Override
  const ov = overrides.get(`${employeeId}:${dateStr(date)}`);
  if (ov) return ov.shift_key;

  // 2. Уволен
  const emp = getEmployee(employeeId);
  if (emp.dismissed_at && date > emp.dismissed_at) return 'dismissed';

  // 3. Паттерн (сортированы по cycle_start desc — берём первый <= date)
  const pattern = patterns
    .filter(p => p.employee_id === employeeId && p.cycle_start <= date)
    .sort((a, b) => b.cycle_start.getTime() - a.cycle_start.getTime())[0];
  if (pattern) {
    const diff = daysBetween(pattern.cycle_start, date);
    return pattern.pattern[diff % pattern.pattern.length];
  }

  return 'off';
}
```

Весь хардкод (`BASE_PATTERNS`, `getSuperTeamShift`, `EMPLOYEES`) становится **seed-данными** в SQL-миграции — заполняется один раз при деплое, потом редактируется через админку.

---

## Маршруты API (один Worker)

```
POST  /api/auth/send-code
POST  /api/auth/verify-code
GET   /api/auth/check
POST  /api/auth/logout

GET   /api/schedule?month=&project=
POST  /api/schedule?month=&project=
GET   /api/schedule/employees        ← новый: список сотрудников из Postgres
POST  /api/schedule/employees        ← добавить/обновить сотрудника
GET   /api/schedule/patterns/:id
POST  /api/schedule/patterns

POST  /api/swap-request
POST  /api/tg-webhook

GET   /api/profile
POST  /api/profile
GET   /api/profiles
POST  /api/roles

GET   /api/sales/data
POST  /api/sales/upload
```

---

## План миграции (поэтапно)

### Этап 0 — Подготовка (этот документ + скелет)
- [x] ARCHITECTURE.md
- [ ] Создать репо `supportcis-v2` в рабочем GitHub
- [ ] Инициализировать Vite + React + TS + Tailwind
- [ ] Настроить `wrangler.toml` для Worker
- [ ] Создать Supabase-проект (рабочий аккаунт)
- [ ] Написать первую SQL-миграцию (схема + seed из EMPLOYEES/BASE_PATTERNS)

### Этап 1 — График
- [ ] API: GET/POST /api/schedule читает из Postgres
- [ ] Перенести resolveShift() в `app/src/lib/schedule.ts`
- [ ] Компонент ScheduleGrid (замена 4000-строчного файла)
- [ ] Компонент ShiftEditor (редактор клетки)
- [ ] SwapModal
- [ ] Тесты resolveShift() (Jest/Vitest)

### Этап 2 — Auth + роли
- [ ] Перенести auth-worker в worker/src/auth.ts
- [ ] Управление ролями из Postgres (или остаётся KV — решить)

### Этап 3 — Остальные страницы
- [ ] Breaks (Supabase Realtime — уже есть)
- [ ] Sales
- [ ] Reports (TL daily, FCR, Champions)
- [ ] Ops pages

### Этап 4 — Переезд инфры
- [ ] Worker + CF Pages задеплоить в рабочий CF аккаунт
- [ ] DNS supportcis.uk → новый аккаунт
- [ ] Перенести Supabase-проект
- [ ] Обновить TG webhook URL
- [ ] Перенести секреты (RESEND, TG, TG_WEBHOOK_SECRET)
- [ ] Отключить старые воркеры / GitHub Pages

---

## Правила разработки

1. **Данные — в Postgres, кэш — в KV, UI-состояние — в React state/query**
2. **Один Worker — один репо** — нет разрозненных `*.workers.dev`
3. **Seed ≠ хардкод** — данные о сотрудниках живут в БД, в исходниках только логика
4. **Паттерны версионируемые** — при смене ротации создаём новый паттерн с новым cycle_start, старые не удаляем (история)
5. **Типы смен в БД** — shift_types — единый реестр, JS-код не знает конкретных типов
6. **Свапы атомарны** — applySwap() начинает транзакцию в Postgres, либо всё либо ничего
