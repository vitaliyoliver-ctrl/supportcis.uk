# Инструменты переноса данных (KV)

Все скрипты аккаунт-агностичны: id namespace передаётся аргументом, в коде ничего
не зашито. Нужен установленный и залогиненный `wrangler` (`npx wrangler login`).

## Перенос v2 → v2 (передача проекта девопсу)

Сценарий: данные уже лежат в KV вашего тестового воркера, нужно поднять копию
на другом аккаунте Cloudflare.

```bash
# 1. (исходный аккаунт) выгрузить весь KV в файл
node kv-export.mjs <SOURCE_NAMESPACE_ID> kv-dump.json

# 2. (целевой аккаунт) создать свой namespace
npx wrangler kv namespace create AUTH_KV     # вернёт id → в wrangler.toml

# 3. (целевой аккаунт) залить дамп
node kv-import.mjs <TARGET_NAMESPACE_ID> kv-dump.json
```

Переносятся все ключи разом: сессии, коды, роли, профили, график, продажи,
оргструктура.

## Первичный перенос из v1 (одноразово, только исходный владелец)

`migrate-v1-to-v2.ps1` конвертирует схему старых воркеров v1 в формат v2
(график, профили, роли). Id namespace'ов v1 передаются параметрами:

```powershell
.\migrate-v1-to-v2.ps1 -SchedKv <v1_SCHEDULE_KV> -OpsKv <v1_OPS_KV> -TargetKv <v2_KV> -Apply
```

> Продажи и оргструктура из v1 переносятся отдельно (ключи `sales` и
> `ops-structure` в KV v2) — см. форматы в `src/index.ts`.
