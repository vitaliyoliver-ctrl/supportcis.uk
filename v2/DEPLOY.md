# Деплой SupportCIS v2 (с нуля, на свой аккаунт)

Версия самодостаточна и **не привязана к старому проекту**: в репозитории нет
ни id чужих KV, ни URL чужих воркеров, ни ключей чужого Supabase. Всё, что
специфично для аккаунта, задаётся переменными/секретами.

Разворачивается **одним воркером**: он отдаёт и фронт (React SPA), и API
(`/api/*`). Нужен Node 18+ и аккаунт Cloudflare.

```
v2/
├── app/      — фронт (Vite + React). Сборка → app/dist
└── worker/   — Cloudflare Worker (API + раздача app/dist)
```

---

## 1. KV-namespace (сессии, коды, роли, профили, график, продажи, оргструктура)

```bash
cd v2/worker
npx wrangler login
npx wrangler kv namespace create AUTH_KV
```
Команда вернёт `id = "..."`. Вставь его в `wrangler.toml` вместо
`REPLACE_WITH_YOUR_AUTH_KV_ID`.

## 2. Переменные воркера (`wrangler.toml` → `[vars]`)

| Переменная | Что это |
|---|---|
| `SITE` | origin сайта (для CORS). При раздаче одним воркером — его собственный адрес, напр. `https://supportcis-worker.<субдомен>.workers.dev` |
| `OWNER_EMAIL` | кто получает роль TL при первом входе (bootstrap управления ролями) |
| `ALLOWED_DOMAINS` | разрешённые корпоративные домены входа через запятую (по умолчанию `velvix.org,gameup.club`) |
| `TG_CHAT_ID` | чат Telegram для заявок на обмен смен (пусто — уведомления не шлются) |

## 3. Секреты воркера (НЕ в репозитории)

```bash
npx wrangler secret put RESEND_API_KEY      # ключ Resend (письма с кодами входа)
npx wrangler secret put RESEND_FROM          # "SupportCIS <noreply@ВАШ_ВЕРИФИЦ_ДОМЕН>"
npx wrangler secret put TG_BOT_TOKEN          # токен Telegram-бота свапов (опционально)
npx wrangler secret put TG_WEBHOOK_SECRET     # секрет вебхука Telegram (опционально)
```

## 4. Фронт (env + сборка)

Страница «Перерывы» работает через Supabase Realtime. По умолчанию используется
**общий** Supabase-проект компании (тот же, что и на старом сайте, — он спокойно
работает на оба) — поэтому перерывы заводятся «из коробки», ничего настраивать не
обязательно.

Если хочешь свой отдельный проект Supabase — переопредели при сборке
(`v2/app/.env`, см. `.env.example`), создав таблицу `bookings` + Realtime:

```
VITE_SUPABASE_URL=https://<твой-проект>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable ключ>
```
Затем:

```bash
cd ../app
npm install
npm run build        # → v2/app/dist (воркер раздаёт это как статику)
```

## 5. Деплой

```bash
cd ../worker
npm install
npx wrangler deploy
```
Получишь URL вида `https://supportcis-worker.<субдомен>.workers.dev`.
Если `SITE` ещё не совпадал с этим адресом — поправь и передеплой.

## 6. Telegram webhook (если используешь свапы)

У бота **один** вебхук. Направь его на свой задеплоенный воркер:

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<твой-воркер>/api/tg-webhook" \
  --data-urlencode "secret_token=<TG_WEBHOOK_SECRET>"
```
`secret_token` обязан совпадать с секретом `TG_WEBHOOK_SECRET` воркера.

> ⚠️ Пока параллельно работает старая версия на том же боте — заведи для теста
> **отдельного бота** (свой `TG_BOT_TOKEN`). Иначе `setWebhook` на тестовый
> воркер перетянет на себя боевые аппрувы свапов (заявки начнут выдавать
> «Заявка не найдена или истекла»).

## 7. Перенос данных (опционально)

Скрипты в `worker/tools/` (аккаунт-агностичны, см. `tools/README.md`):

```bash
# из исходного аккаунта — выгрузить весь KV
node tools/kv-export.mjs <SOURCE_NAMESPACE_ID> kv-dump.json
# в целевой — залить
node tools/kv-import.mjs <TARGET_NAMESPACE_ID> kv-dump.json
```
Первичный перенос из старых воркеров v1 (график/профили/роли) —
`tools/migrate-v1-to-v2.ps1` (одноразово, id передаются параметрами).

---

## Проверка после деплоя

1. Открыть URL воркера → страница входа.
2. Войти корпоративным email (домен из `ALLOWED_DOMAINS`) → придёт код (Resend).
3. Первый вход с `OWNER_EMAIL` даёт роль TL.
4. Пройтись по разделам: график SG, график НК, перерывы, продажи, отчёты,
   чемпионы, TL-инструменты (Data, FCR, Daily, Main, КСАТ, Роли), Ops.

## Что где хранится

| Данные | Где |
|---|---|
| Сессии, коды, роли, профили, график (SG/НК), продажи, оргструктура, свапы | Cloudflare **KV** (`AUTH_KV`) |
| Перерывы (Realtime) | **Supabase** (env `VITE_SUPABASE_*`) |
| Письма с кодами | **Resend** |
| Сотрудники/паттерны графика | сид в коде (`app/src/lib/seed.ts`, `seedNk.ts`) — редактируется и переносится в БД отдельным этапом |

## Полезное

- Логи воркера: `npx wrangler tail`
- Список ключей KV: `npx wrangler kv key list --namespace-id <id> --remote`
- Повторный деплой: `cd v2/app && npm run build && cd ../worker && npx wrangler deploy`
