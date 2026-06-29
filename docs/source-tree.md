# SupportCIS v2 — Структура исходников

> Весь код в `v2/`. Корень репозитория: `CNAME`, `favicon.svg`, `_bmad/`.

```
v2/
├── .env.example                   ← шаблон переменных окружения
├── Dockerfile                     ← multi-stage: frontend build → server build → slim runtime
├── docker-compose.yml             ← сервисы app (Node 20) + db (PostgreSQL)
├── ARCHITECTURE.md                ← исходный архитектурный документ
├── DEPLOY.md                      ← подробная инструкция по деплою
├── HANDOFF.md                     ← краткая памятка DevOps
│
├── app/                           ← React SPA (Vite 5 + TypeScript)
│   ├── index.html
│   ├── vite.config.ts             ← proxy /api/* → localhost:8787 в dev
│   ├── tsconfig.json
│   ├── package.json               ← React 18, TanStack Query v5, React Router v6, Tailwind v3, xlsx
│   ├── dev-mock-api.ts            ← моковый API для VITE_MOCK_API=1
│   └── src/
│       ├── main.tsx               ← точка входа (BrowserRouter + QueryClient)
│       ├── App.tsx                ← роутер (lazy routes + RequireAuth/RequireRole)
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── components/
│       │   └── BackButton.tsx
│       ├── lib/
│       │   ├── types.ts           ← общие типы
│       │   ├── shiftDefs.ts       ← реестр типов смен
│       │   ├── seed.ts            ← статический сид SG (сотрудники + паттерны)
│       │   ├── seedNk.ts          ← статический сид НК
│       │   ├── scheduleLogic.ts   ← вычисление смены (override > dismiss > custom > base)
│       │   ├── scheduleLogic.test.ts
│       │   ├── schedule.ts        ← вспом. функции графика
│       │   ├── schedule.test.ts
│       │   ├── scheduleApi.ts     ← fetch /api/schedule
│       │   ├── helpdeskApi.ts     ← fetch /api/helpdesk/* (с типами)
│       │   ├── projects.ts        ← список проектов (sg, nk)
│       │   └── useScheduleState.ts ← хук состояния графика
│       └── pages/
│           ├── LoginPage.tsx
│           ├── HomePage.tsx
│           ├── SupportPage.tsx
│           ├── ProfilePage.tsx
│           ├── TicketsPage.tsx    ← HelpDesk: список, просмотр, ответ, теги
│           ├── BreaksPage.tsx     ← Supabase Realtime
│           ├── SalesPage.tsx
│           ├── ReportPage.tsx     ← Power Automate (URL зашит)
│           ├── ReportNcPage.tsx   ← Power Automate (НК)
│           ├── ChampionsPage.tsx
│           ├── schedule/
│           │   ├── SchedulePage.tsx        ← принимает project prop
│           │   ├── schedule.css
│           │   ├── exportExcel.ts          ← экспорт в xlsx
│           │   └── components/
│           │       ├── ScheduleSection.tsx
│           │       ├── StatsBar.tsx
│           │       ├── DayInfoPanel.tsx
│           │       ├── PatternModal.tsx
│           │       ├── SwapModal.tsx
│           │       ├── ShiftEditorModal.tsx
│           │       ├── ProfileModal.tsx
│           │       ├── ProfilePanel.tsx
│           │       ├── AddEmployeeModal.tsx
│           │       ├── DismissModal.tsx
│           │       ├── LogPanel.tsx
│           │       └── Toast.tsx
│           ├── tl/
│           │   ├── TLPage.tsx
│           │   ├── TLMainPage.tsx
│           │   ├── TLDataPage.tsx          ← Power Automate
│           │   ├── TLDailyReport.tsx
│           │   ├── TLFcrPage.tsx
│           │   ├── TLCsatPage.tsx
│           │   ├── TLRolesPage.tsx         ← управление ролями
│           │   └── TLHelpdeskAuditPage.tsx ← журнал HelpDesk (только TL)
│           └── ops/
│               ├── OpsPage.tsx
│               ├── OpsStructure.tsx
│               └── OpsPayment.tsx
│
├── worker/                        ← Node.js сервер (Hono + pg)
│   ├── package.json               ← hono, @hono/node-server, pg
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               ← ВСЕ маршруты /api/* (рантайм-независимы)
│       ├── server.ts              ← Node-входная точка: статика + API + Postgres
│       └── store.ts               ← Store interface + PgStore (таблица kv)
│   └── tools/
│       ├── README.md
│       ├── kv-export.mjs          ← дамп данных из Cloudflare KV
│       ├── kv-import.mjs          ← импорт в CF KV (устарело)
│       ├── kv-import-pg.mjs       ← импорт kv-dump.json → PostgreSQL
│       ├── api-migrate.mjs        ← миграция через API
│       ├── migrate-schedule-v1-to-v2.ps1
│       └── migrate-v1-to-v2.ps1
│
└── supabase/
    └── migrations/
        ├── 001_schema.sql         ← реляционная схема (задел, не используется в коде)
        └── 002_seed.sql           ← сид для реляционной схемы
```
