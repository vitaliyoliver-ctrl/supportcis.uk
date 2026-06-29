# SupportCIS v2 — Модели данных

## Рабочая схема БД

Текущий код использует **одну таблицу** `kv` в PostgreSQL. Все данные — JSON-строки.

```sql
CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ          -- NULL = вечный; не-NULL = автоудаление через sweepExpired()
);
CREATE INDEX kv_expires_at_idx ON kv (expires_at) WHERE expires_at IS NOT NULL;
```

Адаптер `worker/src/store.ts` (интерфейс `Store`):
- `get(key)` — SELECT + фильтр по `expires_at > now()`
- `put(key, value, { expirationTtl? })` — INSERT ON CONFLICT DO UPDATE
- `delete(key)` — DELETE
- `list(prefix)` — SELECT LIKE prefix% (непротухшие)
- `sweepExpired()` — DELETE WHERE expires_at <= now() (раз в 10 мин, из server.ts)

---

## Структуры JSON по ключам

### `roles`
```ts
{
  tl: string[];         // email-адреса
  supervisor: string[];
  ops: string[];
}
```

---

### `profiles`
```ts
Record<email: string, {
  name: string;
  position: string;
  telegram: string;     // без @, 3-32 символа [a-zA-Z0-9_]
  since: string;        // произвольная строка (дата приёма)
}>
```

---

### `schedule:{project}:{month}` (`project` = `sg` | `nk`, `month` = `YYYY-MM`)
```ts
{
  overrides: Record<`${name}:${YYYY-MM-DD}`, OverrideObj>;
  settings: {};      // legacy-поле, больше не пишется; настройки хранятся глобально
  version: number;   // инкрементируется при каждом POST; для оптимистичной блокировки
  log: LogEntry[];   // последние 200 записей
}
```

**OverrideObj:**
```ts
{
  type: string;       // ключ типа смены из shiftDefs.ts
  extraEvents?: Array<{
    type: string;     // 'loss_swap_give' | 'extra_swap_take' | ...
    hours: number;
    range: string;
    swapWith: string;
    win: number[] | null;
    withLunch: boolean;
  }>;
  note?: string;
  editedBy?: string;
  editedAt?: string;
}
```

**LogEntry:**
```ts
{ at: string; by: string; action: string; target: string | null }
```

---

### `schedule-settings:{project}`
Глобальные настройки графика (хранятся отдельно от месячных блобов; читаются при каждом GET /api/schedule). Структура определяется фронтом:
```ts
{
  operatorPatterns?: Record<name, Array<{ pattern: string[], cycleStart: string, v: number }>>;
  operatorOrder?: string[];
  positions?: Record<name, string>;
  dismissed?: Record<name, string>;  // дата увольнения
  customOverrides?: Record<name, unknown>;
  // ... прочие настройки секции
}
```

---

### `sales`
```ts
Record<"YYYY-MM", {
  rows: unknown[];           // строки таблицы (формат — как загрузил TL/ops)
  dateFrom: string | null;
  dateTo: string | null;
}>
```

---

### `ops-structure`
Массив объектов отделов (структура определяется OpsStructure-редактором на фронте).

---

### `session:{token}` (TTL 7 дней)
```ts
{ email: string; role: 'tl' | 'supervisor' | 'ops' | 'operator' }
```

---

### `otp:{email}` (TTL 10 минут)
```ts
{ code: string; sentAt: number; attempts: number }
```

---

### `swap:{uuid}` (TTL 60 дней)
```ts
{
  id: string;
  status: 'pending' | 'approved' | 'denied';
  giverEmail: string;
  project: 'sg' | 'nk';
  month: string;
  date: string;
  giver: string;
  recipient: string;
  recipientEmail: string;
  shiftType: string;
  shiftLabel: string;
  range: string;
  hours: number;
  withLunch: boolean;
  win: number[] | null;
  comment: string;
  createdAt: string;
  tgMessageId: number | null;
  decidedBy?: string;
  decidedAt?: string;
}
```

---

### `hd-filters:{email}` (без TTL, до 50 элементов)
```ts
Array<{
  name: string;
  statuses: string[];
  teamIDs: string[];
  createdFrom?: string;
  createdTo?: string;
  activeFrom?: string;
  activeTo?: string;
}>
```

---

### `hd-rl:{email}:{window}` (TTL 120 с)
`string` — число запросов за текущее 60-секундное окно.

---

### `hd-audit:{ISO-timestamp}:{shortUUID}` (TTL 90 дней)
```ts
{ at: string; by: string; action: 'list'|'view'|'create'|'reply'|'note'|'assign'|'status'|'tag'; detail: string }
```

---

## Будущая реляционная схема (задел)

Файл `v2/supabase/migrations/001_schema.sql` описывает нормализованную схему, **которую текущий рабочий код не использует**:

| Таблица | Назначение |
|---|---|
| `sections` | Секции графика (SG, НК, ...) |
| `employees` | Сотрудники (сейчас — сид в коде) |
| `shift_types` | Типы смен (сейчас — `shiftDefs.ts`) |
| `shift_patterns` | Паттерны смен с версионированием |
| `schedule_overrides` | Ручные правки (сейчас — в `kv` как overrides) |
| `swaps` | Заявки на обмен смен (сейчас — в `kv` как swap:*) |
| `schedule_log` | Лог изменений |

Переход на эту схему — потенциальное будущее улучшение, позволяющее убрать KV-хранилище.
