#!/usr/bin/env bash
#
# Настройка и диагностика Telegram-бота свапов (заявки на обмен смены).
#
# Запускать НА СЕРВЕРЕ, где есть доступ к api.telegram.org и заполнен .env.
# Делает по шагам и печатает результат каждого:
#   1. getMe           — токен живой?
#   2. sendMessage     — тестовое сообщение в чат (воспроизводит то, что шлёт
#                        кнопка «Отдать смену»; здесь видно реальную ошибку)
#   3. setWebhook      — регистрирует вебхук апрува на $SITE/api/tg-webhook
#   4. getWebhookInfo  — подтверждает, что вебхук принят и без ошибок доставки
#
# Значения берутся из окружения или из .env рядом (../../.env по умолчанию).
# Требуются: TG_BOT_TOKEN, TG_WEBHOOK_SECRET, TG_CHAT_ID, SITE
#
# Использование:
#   bash worker/tools/tg-setup.sh                 # всё: диагностика + setWebhook
#   bash worker/tools/tg-setup.sh check           # только getMe + sendMessage + getWebhookInfo
#   bash worker/tools/tg-setup.sh hook            # только setWebhook + getWebhookInfo
#   ENV_FILE=/path/.env bash worker/tools/tg-setup.sh
#
set -euo pipefail

MODE="${1:-all}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../../.env}"

# Подхватываем .env, если переменные ещё не в окружении.
if [ -f "$ENV_FILE" ]; then
  echo "→ читаю переменные из $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${TG_BOT_TOKEN:?нет TG_BOT_TOKEN (в окружении или .env)}"
: "${SITE:?нет SITE (например https://plevantis.net)}"

API="https://api.telegram.org/bot${TG_BOT_TOKEN}"
HOOK_URL="${SITE%/}/api/tg-webhook"

jqp() { if command -v jq >/dev/null 2>&1; then jq .; else cat; fi; }

check_token() {
  echo "=== 1. getMe ==="
  curl -sS "$API/getMe" | jqp
  echo
}

test_send() {
  echo "=== 2. sendMessage (тест в TG_CHAT_ID) ==="
  : "${TG_CHAT_ID:?нет TG_CHAT_ID}"
  curl -sS "$API/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "text=✅ Проверка бота свапов: связь с чатом работает." \
    | jqp
  echo "  (если ok:false — это и есть причина «Ошибки при отправке» в кнопке)"
  echo
}

set_hook() {
  echo "=== 3. setWebhook → $HOOK_URL ==="
  : "${TG_WEBHOOK_SECRET:?нет TG_WEBHOOK_SECRET}"
  curl -sS "$API/setWebhook" \
    --data-urlencode "url=${HOOK_URL}" \
    --data-urlencode "secret_token=${TG_WEBHOOK_SECRET}" \
    --data-urlencode 'allowed_updates=["callback_query"]' \
    | jqp
  echo "  (secret_token обязан совпадать с TG_WEBHOOK_SECRET сервера, иначе вебхук вернёт 403)"
  echo
}

hook_info() {
  echo "=== 4. getWebhookInfo ==="
  curl -sS "$API/getWebhookInfo" | jqp
  echo "  (смотри url, pending_update_count и last_error_message)"
  echo
}

case "$MODE" in
  check) check_token; test_send; hook_info ;;
  hook)  set_hook; hook_info ;;
  all)   check_token; test_send; set_hook; hook_info ;;
  *) echo "неизвестный режим: $MODE (ожидаю all|check|hook)"; exit 1 ;;
esac

echo "Готово."
