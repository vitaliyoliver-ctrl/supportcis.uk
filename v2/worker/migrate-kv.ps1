# Миграция данных из старых KV в новый AUTH_KV.
# Запуск (сухой прогон):  powershell -ExecutionPolicy Bypass -File .\migrate-kv.ps1
# Реальная миграция:       .\migrate-kv.ps1 -Apply
#
# Источники:
#   SCHEDULE_KV  (0ebe3fb553fe4abf855ca1124d2bb597) — расписания + настройки + профили
#   OPS_KV       (2e73bd6374e944ac8b114c777eae15c9) — role-lists
# Назначение:
#   AUTH_KV      (e8660703a72b45e69d4e2750a6f88228) — новый формат

param([switch]$Apply)

$SCHED_KV = "0ebe3fb553fe4abf855ca1124d2bb597"   # SCHEDULE_KV (старый)
$OPS_KV   = "2e73bd6374e944ac8b114c777eae15c9"   # ops-structure-data (роли)
$NEW_KV   = "e8660703a72b45e69d4e2750a6f88228"   # AUTH_KV (новый)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tmp  = Join-Path $PWD "migrate-tmp.json"

function KvGet($nsId, $key) {
  $raw = npx wrangler kv key get $key --namespace-id $nsId --remote | Out-String
  return $raw.TrimEnd("`r", "`n")
}

function KvPut($nsId, $key, $value) {
  [System.IO.File]::WriteAllText($tmp, $value, $utf8)
  npx wrangler kv key put $key --namespace-id $nsId --remote --path $tmp | Out-Null
}

# ── 1. Список ключей старого SCHEDULE_KV ─────────────────────────────────────
Write-Host "Читаю список ключей SCHEDULE_KV..." -ForegroundColor Cyan
$schedKeys = (npx wrangler kv key list --namespace-id $SCHED_KV --remote | Out-String |
              ConvertFrom-Json) | ForEach-Object { $_.name }

$schedMonths = $schedKeys | Where-Object { $_ -match '^schedule-sg:(\d{4}-\d{2})$' }
$profileKeys = $schedKeys | Where-Object { $_ -match '^profile:' }

# ── 2. Общие настройки (settings-sg) ─────────────────────────────────────────
Write-Host "Читаю settings-sg..." -ForegroundColor Cyan
$settingsJson = KvGet $SCHED_KV "settings-sg"
$settings = $settingsJson | ConvertFrom-Json

# Конвертируем в новый формат settings (убираем customHours — он уходит в employeeOverrides.hours)
$newSettings = @{
  customOrder      = $settings.customOrder
  dismissed        = $settings.dismissed
  operatorPatterns = $settings.operatorPatterns
  employeeOverrides = $settings.employeeOverrides
}

# Переносим customHours → employeeOverrides[name].hours (если ещё не задано)
if ($settings.customHours) {
  foreach ($prop in $settings.customHours.PSObject.Properties) {
    $name = $prop.Name
    $hours = $prop.Value
    if (-not $newSettings.employeeOverrides) { $newSettings.employeeOverrides = @{} }
    if (-not $newSettings.employeeOverrides.$name) {
      $newSettings.employeeOverrides.$name = @{ hours = $hours }
    } elseif ($null -eq $newSettings.employeeOverrides.$name.hours) {
      $newSettings.employeeOverrides.$name | Add-Member -NotePropertyName hours -NotePropertyValue $hours -Force
    }
  }
}

# ── 3. Мигрируем расписания: schedule-sg:YYYY-MM → schedule:sg:YYYY-MM ───────
Write-Host "`nРасписания: $($schedMonths.Count) месяцев" -ForegroundColor Cyan

foreach ($key in $schedMonths) {
  $key -match '^schedule-sg:(\d{4}-\d{2})$' | Out-Null
  $ym     = $Matches[1]
  $newKey = "schedule:sg:$ym"

  if (-not $Apply) {
    Write-Host "[dry] $key  ->  $newKey  (merged with settings-sg)"
    continue
  }

  Write-Host "  $key -> $newKey ..." -ForegroundColor Green
  $raw  = KvGet $SCHED_KV $key
  $blob = $raw | ConvertFrom-Json

  $merged = @{
    overrides = $blob.overrides
    settings  = $newSettings
    version   = $blob.version
    log       = $blob.log
  }
  KvPut $NEW_KV $newKey ($merged | ConvertTo-Json -Depth 20 -Compress)
}

# ── 4. Мигрируем профили: profile:<email> → объединённый ключ "profiles" ──────
Write-Host "`nПрофили: $($profileKeys.Count) ключей" -ForegroundColor Cyan

$profilesMap = @{}
foreach ($key in $profileKeys) {
  $email = $key -replace '^profile:', ''

  if (-not $Apply) {
    Write-Host "[dry] $key  ->  profiles[$email]"
    continue
  }

  Write-Host "  $key ..." -ForegroundColor Green
  $raw = KvGet $SCHED_KV $key
  try { $profilesMap[$email] = $raw | ConvertFrom-Json } catch { $profilesMap[$email] = $raw }
}

if ($Apply -and $profileKeys.Count -gt 0) {
  Write-Host "  Записываю profiles ..." -ForegroundColor Green
  KvPut $NEW_KV "profiles" ($profilesMap | ConvertTo-Json -Depth 10 -Compress)
}

# ── 5. Копируем роли: role-lists (OPS_KV) → roles (AUTH_KV) ──────────────────
Write-Host "`nРоли..." -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host "[dry] role-lists (OPS_KV)  ->  roles (AUTH_KV)"
} else {
  Write-Host "  role-lists -> roles ..." -ForegroundColor Green
  $rolesRaw = KvGet $OPS_KV "role-lists"
  KvPut $NEW_KV "roles" $rolesRaw
}

# ── Готово ────────────────────────────────────────────────────────────────────
if (Test-Path $tmp) { Remove-Item $tmp -Force }

if ($Apply) {
  Write-Host "`nГотово! Перенесено:" -ForegroundColor Cyan
  Write-Host "  Расписания : $($schedMonths.Count)"
  Write-Host "  Профили    : $($profileKeys.Count)"
  Write-Host "  Роли       : 1 (role-lists -> roles)"
} else {
  Write-Host "`nЭто был сухой прогон. Для реального переноса запусти:" -ForegroundColor Yellow
  Write-Host "  .\migrate-kv.ps1 -Apply" -ForegroundColor White
}
