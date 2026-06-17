# Деплой v2 на Cloudflare (тестовый запуск)

Всё разворачивается **одним воркером**: он отдаёт и фронт (React SPA), и API
(`/api/*`). Адрес теста — `https://supportcis-worker.<твой-сабдомен>.workers.dev`.
Живой сайт v1 это не трогает.

Все команды — из папки репозитория. Нужен установленный Node 18+.

---

## 0. Один раз: вход в Cloudflare

```bash
cd v2/worker
npx wrangler login        # откроется браузер — войди в свой Cloudflare аккаунт
```

## 1. Создать KV (хранилище сессий/данных)

```bash
npx wrangler kv namespace create AUTH_KV
```
Команда выведет строку с `id = "..."`. Скопируй этот id и вставь в
`v2/worker/wrangler.toml` вместо `REPLACE_WITH_AUTH_KV_ID`.

## 2. Собрать фронт

```bash
cd ../app
npm install
npm run build        # соберёт в v2/app/dist — воркер отдаёт это как статику
```

## 3. Задать секреты воркера

```bash
cd ../worker
npx wrangler secret put RESEND_API_KEY      # вставь ключ Resend
npx wrangler secret put RESEND_FROM         # напр.  SupportCIS <noreply@ТВОЙ_ДОМЕН>
# опционально, для уведомлений о свапах в Телеграм:
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET
```

> `RESEND_FROM` должен быть на домене, **верифицированном в Resend**. Если домен
> ещё не верифицирован — для теста можно временно использовать
> `onboarding@resend.dev` (Resend разрешает слать только на свой же email).

## 4. Задеплоить

```bash
npx wrangler deploy
```
В конце получишь URL вида `https://supportcis-worker.xxxxx.workers.dev`.

## 5. Проверить

1. Открой этот URL → должна открыться страница входа.
2. Введи свой корпоративный email (`@velvix.org` / `@gameup.club`) → придёт код.
3. Войди. Первый вход с `OWNER_EMAIL` (см. wrangler.toml) автоматически даёт
   роль **TL** — то есть полный доступ (график, роли, продажи).
4. Кликай по разделам: график, перерывы, продажи, отчёты, TL-инструменты, Ops.

---

## Повторный деплой после правок

```bash
cd v2/app && npm run build && cd ../worker && npx wrangler deploy
```

## Что где хранится

| Данные | Где |
|---|---|
| Сессии, коды, роли, профили, график, продажи, свапы | Cloudflare **KV** (`AUTH_KV`) |
| Сотрудники, секции, типы смен, паттерны | **Supabase** Postgres (уже залито) |
| Перерывы (Realtime) | **Supabase** (anon-ключ зашит в фронт по умолчанию) |
| Письма с кодами | **Resend** |

## Полезное

- Логи воркера в реальном времени: `npx wrangler tail`
- Посмотреть KV: `npx wrangler kv key list --binding AUTH_KV`
- Выдать кому-то роль: войди как TL → раздел «Роли» в TL-инструментах.

## Заметки на будущее (не для теста)

- Боевой домен `plevantis.net`: добавить Custom Domain к воркеру в дашборде
  (Workers → supportcis-worker → Settings → Domains & Routes), поменять `SITE`.
- TG-аппрув свапов (кнопки принять/отклонить) пока не перенесён — сейчас только
  уведомление в чат.
- Power Automate вебхуки в TL Data Analyzer пока захардкожены.
- График хранится в KV (как в v1); реляционный Postgres для графика — отдельный
  этап после теста.
