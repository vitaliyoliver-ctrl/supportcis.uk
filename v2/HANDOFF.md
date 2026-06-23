# SupportCIS v2 — инструкция по развёртыванию (DevOps)

Внутренний портал поддержки. **Один Docker-контейнер** отдаёт и фронт (React SPA),
и API (`/api/*`); данные — в **PostgreSQL**. Cloudflare не нужен. Версия
самодостаточна: всё, что зависит от окружения, задаётся в `.env`.

Команды ниже выполняются из каталога, где лежит `docker-compose.yml`.

---

## 1. Что нужно

- Docker + Docker Compose на сервере.
- Домен и reverse-proxy (nginx/Traefik/Caddy) с TLS — повесить перед контейнером.
- Значения для `.env` (домен, пароль БД, ключи Resend и т.д.) — переданы владельцем
  отдельно. Полный список переменных с комментариями — в `.env.example`.
- Файл `kv-dump.json` с актуальными данными — передан владельцем (см. §4).

## 2. Развернуть

```bash
cp .env.example .env       # заполнить переданными значениями
docker compose up -d --build
```

Поднимется два контейнера: `db` (PostgreSQL, схема создаётся автоматически при
первом старте) и `app` (фронт + API на порту 8787, по умолчанию). Проверка, что
сервис жив:

```bash
curl http://localhost:8787/api/health      # {"ok":true}
```

## 3. TLS / домен

Контейнер слушает обычный HTTP на порту `APP_PORT` (по умолчанию 8787). Заверните
его своим reverse-proxy с TLS на ваш домен. В `.env` переменная `SITE` должна
равняться публичному адресу портала (напр. `https://portal.company.com`).

## 4. Загрузить данные

Владелец передал файл `kv-dump.json` (актуальные роли, профили, график, оргструктура).
Доступ к Cloudflare для этого НЕ нужен. Заливаем файл в Postgres контейнера:

```bash
docker compose cp kv-dump.json app:/srv/kv-dump.json
docker compose cp worker/tools/kv-import-pg.mjs app:/srv/kv-import-pg.mjs
docker compose exec app node /srv/kv-import-pg.mjs /srv/kv-dump.json \
  "postgres://${POSTGRES_USER:-supportcis}:<POSTGRES_PASSWORD>@db:5432/${POSTGRES_DB:-supportcis}"
```

(`<POSTGRES_PASSWORD>` — то, что задали в `.env`.) В конце: `Готово. Импортировано: N`.
Импорт идемпотентен — можно повторять свежим дампом. Эфемерные ключи (сессии, коды)
не переносятся, пересоздаются сами.

## 5. Проверить

1. Открыть адрес портала → страница входа.
2. Войти корпоративным email (домен из `ALLOWED_DOMAINS`) — код придёт письмом (Resend).
3. Первый вход с `OWNER_EMAIL` даёт роль TL; дальше роли раздаются в интерфейсе
   (TL → «Управление ролями»).
4. Пройтись по разделам: график SG, график НК, перерывы, продажи, отчёты, чемпионы,
   TL-инструменты (Data, FCR, Daily, Main, КСАТ, Роли), Ops.

## 6. Внешние сервисы (работают из коробки, настраивать не нужно)

- **Supabase** (страница «Перерывы») — общий проект компании, зашит во фронт.
- **Power Automate** (отчёты) — URL потоков компании зашиты в коде
  (`app/src/pages/ReportPage.tsx`, `ReportNcPage.tsx`, `tl/TLDataPage.tsx`).
  Трогать, только если потоки пересоздадут.
- **Resend** (письма с кодами входа) — задаётся ключом в `.env`.

## 7. После запуска (опционально): Telegram-бот свапов

Заявки на обмен смен апрувятся в Telegram. Подключается **после** того, как портал
поднят и доступен по https. У бота один вебхук — направить его на новый сервер:

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<домен>/api/tg-webhook" \
  --data-urlencode "secret_token=<TG_WEBHOOK_SECRET>"
```

`secret_token` обязан совпадать с `TG_WEBHOOK_SECRET` в `.env`. Значения
(`TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`, `TG_CHAT_ID`) добавляются в `.env` и
`docker compose up -d` перезапускает `app`.

> ⚠️ У бота один вебхук на всех. Если параллельно ещё жив старый сайт на том же
> боте — переключайте на финальном переезде (или заведите отдельного бота для теста).

---

## Архитектура и детали

- **`DEPLOY.md`** — расширенная пошаговая инструкция (локальная разработка,
  свой Supabase через build-args, полезные команды).
- **`ARCHITECTURE.md`** — как устроено: маршруты, модель хранения (таблица `kv`),
  логика графика, структура репозитория.

Кратко: `worker/src/index.ts` — маршруты `/api/*` (Hono, рантайм-независимы);
`worker/src/server.ts` — Node-вход (статика SPA + API + Postgres); `worker/src/store.ts`
— адаптер хранилища на одной таблице `kv(key, value, expires_at)` (сменить БД =
новая реализация `Store`, маршруты не трогаются).

## Обслуживание

- Логи: `docker compose logs -f app`
- Состояние: `docker compose ps`
- Бэкап БД: `docker compose exec db pg_dump -U <POSTGRES_USER> <POSTGRES_DB> > backup.sql`
- Обновление кода: `git pull && docker compose up -d --build`
- Консоль БД: `docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB>`
