-- SupportCIS v2: начальная схема
-- Заменяет: EMPLOYEES (хардкод), BASE_PATTERNS, scheduleOverrides (KV), swap:* (KV)

-- ── Секции графика ────────────────────────────────────────────────────────────
CREATE TABLE sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'blue',
  sort_order INT  NOT NULL DEFAULT 0
);

-- ── Сотрудники ────────────────────────────────────────────────────────────────
CREATE TABLE employees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  position     TEXT NOT NULL DEFAULT '',
  hired_at     DATE,
  dismissed_at DATE,
  hours        SMALLINT,
  section_id   UUID REFERENCES sections(id) ON DELETE SET NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON employees (section_id);

-- ── Типы смен ─────────────────────────────────────────────────────────────────
CREATE TABLE shift_types (
  key       TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  category  TEXT NOT NULL DEFAULT 'Other',
  hours     SMALLINT NOT NULL DEFAULT 0,
  win_start SMALLINT,
  win_end   SMALLINT,
  is_night  BOOLEAN NOT NULL DEFAULT false,
  is_extra  BOOLEAN NOT NULL DEFAULT false,
  base_key  TEXT REFERENCES shift_types(key),
  givable   BOOLEAN NOT NULL DEFAULT false,
  legacy    BOOLEAN NOT NULL DEFAULT false
);

-- ── Паттерны смен ─────────────────────────────────────────────────────────────
CREATE TABLE shift_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_start DATE NOT NULL,
  pattern     TEXT[] NOT NULL,
  priority    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  UNIQUE (employee_id, cycle_start)
);

CREATE INDEX ON shift_patterns (employee_id);

-- ── Overrides (ручные правки + свапы) ────────────────────────────────────────
CREATE TABLE schedule_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  shift_key    TEXT NOT NULL REFERENCES shift_types(key),
  extra_events JSONB NOT NULL DEFAULT '[]',
  custom_hours SMALLINT,
  note         TEXT,
  edited_by    TEXT,
  edited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX ON schedule_overrides (date);
CREATE INDEX ON schedule_overrides (employee_id);

-- ── Свапы ─────────────────────────────────────────────────────────────────────
CREATE TABLE swaps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status         TEXT NOT NULL DEFAULT 'pending',
  giver_id       UUID NOT NULL REFERENCES employees(id),
  recipient_id   UUID NOT NULL REFERENCES employees(id),
  date           DATE NOT NULL,
  shift_key      TEXT NOT NULL REFERENCES shift_types(key),
  shift_label    TEXT,
  range          TEXT,
  hours          SMALLINT NOT NULL,
  with_lunch     BOOLEAN NOT NULL DEFAULT false,
  win            SMALLINT[],
  comment        TEXT,
  tg_message_id  BIGINT,
  decided_by     TEXT,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON swaps (giver_id);
CREATE INDEX ON swaps (recipient_id);
CREATE INDEX ON swaps (date);

-- ── Лог изменений ─────────────────────────────────────────────────────────────
CREATE TABLE schedule_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  by          TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_name TEXT,
  month       TEXT
);

CREATE INDEX ON schedule_log (month);
