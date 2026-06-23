# Инструменты переноса данных

Текущие данные лежат в Cloudflare KV исходного аккаунта. Для self-hosting на
Postgres перенос в два шага: **выгрузить дамп из KV** → **залить в Postgres**.

## Перенос KV → Postgres (основной путь)

```bash
# 1. (где есть доступ к KV) выгрузить весь namespace в JSON
#    нужен залогиненный wrangler: npx wrangler login
node kv-export.mjs <CF_NAMESPACE_ID> kv-dump.json

# 2. (из каталога worker/, там установлен пакет pg) залить дамп в Postgres
cd ..
node tools/kv-import-pg.mjs tools/kv-dump.json "postgres://USER:PASS@HOST:5432/DB"
#    (строку подключения можно не передавать — возьмётся из $DATABASE_URL)
```

- Переносятся все «вечные» ключи: роли, профили, график (SG/НК), продажи,
  оргструктура.
- Эфемерные ключи (`session:`, `otp:`, `swap:`) **пропускаются** — они одноразовые
  и пересоздаются сами; перенос оставил бы протухшие сессии.
- Импорт идемпотентен (upsert) — можно повторять, обновляя данные свежим дампом.

## Файлы

| Скрипт | Назначение |
|---|---|
| `kv-export.mjs` | выгрузка KV namespace → JSON (`[{key,value}]`). Нужен `wrangler`. |
| `kv-import-pg.mjs` | импорт этого JSON в Postgres-таблицу `kv` (см. `src/store.ts`). Нужен `pg`. |

## Легаси (история, для self-hosting не нужны)

Скрипты ниже относятся к старой Cloudflare-инфраструктуре (перенос между KV) и
оставлены в истории. Для Postgres-деплоя не используются:

- `kv-import.mjs` — заливка дампа обратно в **CF KV** (а не в Postgres).
- `migrate-v1-to-v2.ps1`, `migrate-schedule-v1-to-v2.ps1` — конвертация схемы
  старых воркеров v1 в формат v2 **внутри Cloudflare KV**.
