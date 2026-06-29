# SupportCIS v2 — API-контракты

Все эндпоинты живут в `v2/worker/src/index.ts`. База URL: `https://<SITE>`. Аутентификация — cookie `auth_token` (устанавливается при `/api/verify-code`).

Общие коды ответов:
- `401` — нет сессии
- `403` — роль не позволяет
- `429` — слишком много запросов (OTP или HelpDesk rate limit)
- `409` — конфликт версии при сохранении графика

---

## Auth

### `POST /api/send-code`
Отправить OTP на корпоративный email. Cooldown 50 с.

**Body:** `{ email: string }`
**Response 200:** `{ ok: true }`
**Response 400:** `{ ok: false, error: string }` — некорректный/запрещённый домен

---

### `POST /api/verify-code`
Проверить OTP, создать сессию.

**Body:** `{ email: string, code: string }`
**Response 200:** `{ ok: true, email: string, role: 'tl'|'supervisor'|'ops'|'operator' }` + Set-Cookie `auth_token`
**Response 400:** `{ ok: false, error: string }` — неверный/истёкший код
**Response 429:** `{ ok: false, error: string }` — 5+ попыток

---

### `GET /api/check`
Проверить текущую сессию.

**Response 200:** `{ ok: true, email: string, role: string }`
**Response 401:** `{ ok: false }`

---

### `POST /api/logout`
Завершить сессию (удаляет cookie и запись в kv).

**Response 200:** `{ ok: true }`

---

## Профили

### `GET /api/profiles`
Все профили. Требует сессии (любая роль).

**Response:** `{ ok: true, profiles: Record<email, { name, position, telegram, since }> }`

---

### `GET /api/profile?email=`
Один профиль. Если `email` не указан — текущий пользователь.

**Response:** `{ ok: true, profile: { name, position, telegram, since } | null }`

---

### `POST /api/profile`
Сохранить профиль. Свой — любой; чужой — только TL.

**Body:** `{ email?: string, name?: string, position?: string, telegram?: string, since?: string }`
**Response:** `{ ok: true, profile: Profile }`

---

### `DELETE /api/profile?email=`
Удалить профиль. Только TL.

**Response:** `{ ok: true }`

---

## Роли

### `GET /api/roles`
Получить списки ролей. Только TL.

**Response:** `{ ok: true, lists: { tl: string[], supervisor: string[], ops: string[] } }`

---

### `POST /api/roles`
Сохранить списки ролей. Только TL. Нельзя удалить себя из TL.

**Body:** `{ tl?: string[], supervisor?: string[], ops?: string[] }`
**Response:** `{ ok: true, lists: RoleLists, rejected: string[] }` — `rejected` = адреса с недопустимым доменом

---

## График

### `GET /api/schedule?project=sg|nk&month=YYYY-MM`
Получить блоб графика.

**Response:** `{ ok: true, overrides: Record<"name:date", OverrideObj>, settings: GlobalSettings, version: number, log: LogEntry[] }`

---

### `POST /api/schedule?project=sg|nk&month=YYYY-MM`
Сохранить изменения. Требует роль `tl` или `supervisor`. Оптимистичная блокировка по `version`.

**Body:**
```json
{
  "overrides": { ... },
  "settings": { ... },
  "version": 42,
  "logEntries": [{ "action": "string", "target": "name|null" }]
}
```
**Response 200:** `{ ok: true, version: number, log: LogEntry[] }`
**Response 409:** `{ ok: false, error: "stale", version: number }` — клиент устарел, нужно перечитать

---

## Продажи

### `GET /api/sales/data`
Все данные продаж по месяцам.

**Response:** `{ ok: true, data: Record<"YYYY-MM", { rows: unknown[], dateFrom: string|null, dateTo: string|null }> }`

---

### `POST /api/sales/upload`
Загрузить данные продаж за месяц. Роли: TL, ops.

**Body:** `{ month: string, rows: unknown[], dateFrom?: string, dateTo?: string }`
**Response:** `{ ok: true }`

---

## Оргструктура (Ops)

### `GET /api/ops/structure`
Получить массив отделов.

**Response:** массив объектов (структура зависит от OpsStructure-редактора)

---

### `POST /api/ops/structure`
Сохранить массив отделов. Роли: TL, ops.

**Body:** массив отделов
**Response:** `{ ok: true }`

---

## Обмен смен (Swap)

### `POST /api/swap-request`
Создать заявку на обмен смены. Отправляет сообщение в Telegram.

**Body:**
```json
{
  "project": "sg|nk",
  "month": "YYYY-MM",
  "date": "YYYY-MM-DD",
  "giver": "Имя",
  "recipient": "Имя",
  "giverEmail": "...",
  "recipientEmail": "...",
  "shiftType": "morning|evening|...",
  "shiftLabel": "string",
  "range": "09:00–18:00",
  "hours": 9,
  "win": [9, 18],
  "withLunch": false,
  "comment": ""
}
```
**Response 200:** `{ ok: true, id: string }`
**Response 502:** не удалось отправить в Telegram

---

### `POST /api/tg-webhook`
Вебхук Telegram (callback_query апрув/отказ). Проверяет `X-Telegram-Bot-Api-Secret-Token`.

**Response 200:** `{ ok: true }`

---

## HelpDesk (опционально, требует `HELPDESK_*` в `.env`)

Rate limit: 120 запросов/мин на оператора.

### `GET /api/helpdesk/tickets`
Поиск тикетов. Query params: `query`, `status`, `teamIDs[]`, `createdDateFrom/To`, `lastMessageFrom/To`, `cursor`, `pageSize`, `sortBy`, `order`.

**Response:** `{ ok: true, data: Ticket[] }` — почты замаскированы

---

### `POST /api/helpdesk/tickets`
Создать тикет.

**Body:** `{ subject, message, requester, teamIDs, ... }` (формат HelpDesk API v1)
**Response:** `{ ok: true, data: Ticket }`

---

### `GET /api/helpdesk/tickets/:id`
Один тикет с перепиской. Почты замаскированы.

**Response:** `{ ok: true, data: Ticket }`

---

### `GET /api/helpdesk/tickets/:id/related`
Все тикеты клиента (поиск по реальной почте на сервере).

**Response:** `{ ok: true, data: Ticket[] }`

---

### `POST /api/helpdesk/tickets/:id/reply`
Ответ или приватная заметка.

**Body:** `{ text: string, isPrivate?: boolean, status?: string }`
**Response:** `{ ok: true, data: ... }`

---

### `POST /api/helpdesk/tickets/:id/assign`
Сменить группу тикета.

**Body:** `{ teamID: string }`
**Response:** `{ ok: true }`

---

### `POST /api/helpdesk/tickets/:id/status`
Сменить статус тикета.

**Body:** `{ status: string }`
**Response:** `{ ok: true }`

---

### `POST /api/helpdesk/tickets/:id/tags`
Добавить теги.

**Body:** `{ tagIDs: string[] }`
**Response:** `{ ok: true }`

---

### `DELETE /api/helpdesk/tickets/:id/tags/:tagId`
Снять тег.

**Response:** `{ ok: true }`

---

### `GET /api/helpdesk/teams`
Все группы (для фильтра).

**Response:** `{ ok: true, teams: Array<{ ID: string, name: string }> }`

---

### `GET /api/helpdesk/tags`
Все теги аккаунта.

**Response:** `{ ok: true, tags: Array<{ ID: string, name: string }> }`

---

### `GET /api/helpdesk/saved-filters`
Персональные сохранённые фильтры.

**Response:** `{ ok: true, filters: SavedFilter[] }`

---

### `POST /api/helpdesk/saved-filters`
Сохранить фильтры (до 50 шт.).

**Body:** `SavedFilter[]`
**Response:** `{ ok: true }`

---

### `GET /api/helpdesk/audit`
Журнал действий в HelpDesk. Только TL.

**Response:** `{ ok: true, log: Array<{ at, by, action, detail }> }` — последние 500 записей

---

## Диагностика и служебные

### `GET /api/tg-diagnose[?fix=1][?test=1]`
Диагностика Telegram-бота. Только TL. `fix=1` — перерегистрировать вебхук; `test=1` — тестовое сообщение в чат.

**Response:** `{ ok: true, env: {...}, getMe: {...}, getWebhookInfo: {...}, ... }`

---

### `GET /api/health`
Liveness-проверка.

**Response:** `{ ok: true }`
