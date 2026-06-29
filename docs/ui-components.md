# SupportCIS v2 — UI-компоненты и страницы

## Роутинг (App.tsx)

Все маршруты — lazy-loaded. Защищены `RequireAuth` (любая роль) или `RequireRole` (список ролей).

| Путь | Компонент | Доступ |
|---|---|---|
| `/login` | LoginPage | Публичный |
| `/profile` | ProfilePage | Любой авторизованный |
| `/` | HomePage | Любой авторизованный |
| `/support` | SupportPage | Любой авторизованный |
| `/support/tickets` | TicketsPage | Любой авторизованный |
| `/support/schedule` | SchedulePage (project=sg) | Любой авторизованный |
| `/support/schedule-nc` | SchedulePage (project=nk) | Любой авторизованный |
| `/support/breaks` | BreaksPage | Любой авторизованный |
| `/support/sales` | SalesPage | Любой авторизованный |
| `/support/report` | ReportPage | Любой авторизованный |
| `/support/report-nc` | ReportNcPage | Любой авторизованный |
| `/support/champions` | ChampionsPage | Любой авторизованный |
| `/tl` | TLPage | tl, ops |
| `/tl/main` | TLMainPage | tl, ops |
| `/tl/data` | TLDataPage | tl, ops |
| `/tl/daily-report` | TLDailyReport | tl, ops |
| `/tl/fcr` | TLFcrPage | tl, ops |
| `/tl/csat` | TLCsatPage | tl, ops |
| `/tl/roles` | TLRolesPage | tl, ops |
| `/tl/helpdesk-audit` | TLHelpdeskAuditPage | tl (только TL) |
| `/ops` | OpsPage | ops, tl |
| `/ops/structure` | OpsStructure | ops, tl |
| `/ops/payment` | OpsPayment | ops, tl |

---

## Страницы — краткое описание

### Основные (для всех)
- **LoginPage** — форма OTP-входа (email → код → сессия)
- **ProfilePage** — просмотр/редактирование своего профиля (имя, должность, telegram, дата)
- **HomePage** — дашборд / навигация по разделам
- **SupportPage** — раздел-хаб «Поддержка»

### График
- **SchedulePage** — основной экран расписания. Принимает `project` prop (`sg`/`nk`). Содержит 10 вложенных компонентов (см. ниже)

### Сотрудники / операционная работа
- **BreaksPage** — перерывы через Supabase Realtime
- **SalesPage** — просмотр данных продаж по месяцам (загрузка — через TL/ops)
- **ReportPage / ReportNcPage** — отчёты через Power Automate (URL потоков зашит в код)
- **ChampionsPage** — «чемпионы» (доска достижений)
- **TicketsPage** — тикет-система HelpDesk: список, поиск, просмотр переписки, ответ, приватные заметки, теги, смена группы/статуса

### TL-инструменты (`/tl/*`)
- **TLPage** — хаб TL
- **TLMainPage** — основная TL-сводка
- **TLDataPage** — данные через Power Automate
- **TLDailyReport** — ежедневный отчёт
- **TLFcrPage** — FCR-показатели
- **TLCsatPage** — CSAT
- **TLRolesPage** — управление ролями (списки tl/supervisor/ops)
- **TLHelpdeskAuditPage** — журнал действий в HelpDesk (только TL)

### Ops (`/ops/*`)
- **OpsPage** — хаб Ops
- **OpsStructure** — редактор оргструктуры
- **OpsPayment** — расчёт выплат

---

## Компоненты расписания (`app/src/pages/schedule/`)

| Компонент | Назначение |
|---|---|
| `ScheduleSection.tsx` | Секция сотрудников (группа строк) |
| `StatsBar.tsx` | Статистика по месяцу/секции |
| `DayInfoPanel.tsx` | Панель информации при клике на день |
| `PatternModal.tsx` | Модал смены паттерна ротации |
| `SwapModal.tsx` | Модал создания заявки на обмен смен |
| `ShiftEditorModal.tsx` | Ручное редактирование смены |
| `ProfileModal.tsx` | Профиль сотрудника из расписания |
| `ProfilePanel.tsx` | Панель профиля (встроенная) |
| `AddEmployeeModal.tsx` | Добавить сотрудника в кастомные данные |
| `DismissModal.tsx` | Отметить увольнение |
| `LogPanel.tsx` | Лог изменений графика |
| `Toast.tsx` | Уведомления |

---

## Глобальные компоненты

- **BackButton** (`components/BackButton.tsx`) — кнопка назад

---

## Вспомогательные библиотеки

| Файл | Назначение |
|---|---|
| `lib/scheduleLogic.ts` | Вычисление смен (приоритет override > dismiss > custom > base) |
| `lib/shiftDefs.ts` | Реестр типов смен (ключи, метки, часы, окна, givable-флаги) |
| `lib/seed.ts` | Статический сид SG (сотрудники + базовые паттерны) |
| `lib/seedNk.ts` | Статический сид НК |
| `lib/scheduleApi.ts` | Fetch-обёртки `/api/schedule` |
| `lib/helpdeskApi.ts` | Fetch-обёртки `/api/helpdesk/*` |
| `lib/types.ts` | Общие TypeScript-типы |
| `lib/useScheduleState.ts` | React-хук состояния графика |
| `pages/schedule/exportExcel.ts` | Экспорт графика в Excel (xlsx) |

---

## Dev-режим

`npm run dev:mock` запускает Vite с `VITE_MOCK_API=1` — моковый API-сервер (`dev-mock-api.ts`) без реального бэкенда.
