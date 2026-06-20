# SupportCIS v2 — памятка для передачи (DevOps)

Вторая версия внутреннего портала: **один Cloudflare Worker** отдаёт и фронт
(React SPA из `app/dist`), и API (`/api/*`). Данные — в Cloudflare KV.

Версия самодостаточна: в репозитории **нет** id чужих KV, account-id или URL
старых воркеров. Всё специфичное для окружения задаётся переменными/секретами.

## Поднять с нуля

Полная пошаговая инструкция — **`DEPLOY.md`**. Кратко:

1. `npx wrangler kv namespace create AUTH_KV` → полученный id в `worker/wrangler.toml`.
2. Заполнить `[vars]` (`SITE`, `OWNER_EMAIL`, `ALLOWED_DOMAINS`, `TG_CHAT_ID`) и
   секреты (`wrangler secret put`): `RESEND_API_KEY`, `RESEND_FROM`,
   `TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`.
3. `cd app && npm i && npm run build` → `cd ../worker && npm i && npx wrangler deploy`.
4. (Свапы) указать Telegram-вебхук на свой воркер — см. `DEPLOY.md` §6.

Архитектура и схема данных — **`ARCHITECTURE.md`**.

## Подставить под своё окружение (корпоративное, не привязка к v1)

- **Домены входа** — `ALLOWED_DOMAINS` (по умолчанию `velvix.org,gameup.club`).
- **Bootstrap-владелец** — `OWNER_EMAIL`: первый вход даёт роль TL, дальше роли
  раздаются из интерфейса (TL → «Управление ролями»).
- **Resend** — `RESEND_FROM` должен быть на домене, верифицированном в Resend.
- **Telegram-бот свапов** — у бота один вебхук. Пока параллельно жив старый сайт,
  для теста заведи **отдельного** бота, иначе `setWebhook` на новый воркер
  перетянет боевые аппрувы свапов (подробно в `DEPLOY.md` §6).
- **Supabase (перерывы)** — по умолчанию общий проект компании; свой проект
  задаётся через `VITE_SUPABASE_*` (нужна таблица `bookings` + Realtime).
- **Power Automate (отчёты)** — URL потоков компании зашиты в
  `app/src/pages/ReportPage.tsx`, `ReportNcPage.tsx`, `tl/TLDataPage.tsx`
  (отправка трудностей в Teams / анализ выгрузок). Если потоки пересоздадут —
  обновить URL там.
- **Админы перерывов** — список email в `app/src/pages/BreaksPage.tsx` (`ADMINS`).

## Перенос данных

Аккаунт-агностичные скрипты в `worker/tools/` (см. `tools/README.md`):

- `kv-export.mjs` / `kv-import.mjs` — перенос всего KV между аккаунтами.
- `migrate-v1-to-v2.ps1` — одноразовая конвертация графика/профилей/ролей из v1.

## Состояние

- Сборка/типы/тесты зелёные: в `app/` — `npm run typecheck`, `npm test`,
  `npm run build`.
- Перенесены и выверены: график **SG + НК**, перерывы, продажи, чемпионы,
  отчёты (SG/НК), TL-инструменты (Data, FCR, Daily, Main, КСАТ, Роли),
  Ops (структура, оплаты), профили/роли, вход.
