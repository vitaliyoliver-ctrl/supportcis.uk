# Миграция данных графика из старого KV в новый.
# Запуск:  powershell -ExecutionPolicy Bypass -File .\migrate-kv.ps1
# По умолчанию — сухой прогон (только показывает, что будет скопировано).
# Чтобы реально скопировать, запусти с -Apply:  .\migrate-kv.ps1 -Apply

param(
  [switch]$Apply,
  # Копировать также профили (личные кабинеты). Роли НЕ трогаем — они уже настроены в новом.
  [switch]$IncludeProfiles
)

$OLD = "2e73bd6374e944ac8b114c777eae15c9"   # старый KV
$NEW = "e8660703a72b45e69d4e2750a6f88228"   # новый AUTH_KV

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tmp = Join-Path $PWD "migrate-tmp.json"

Write-Host "Читаю список ключей старого KV..." -ForegroundColor Cyan
$json = npx wrangler kv key list --namespace-id $OLD --remote | Out-String
$keys = ($json | ConvertFrom-Json) | ForEach-Object { $_.name }

# Что копируем: все графики + (опц.) профили. Сессии/otp/swap — пропускаем.
$toCopy = @()
foreach ($k in $keys) {
  if ($k -like "schedule:*") { $toCopy += $k }
  elseif ($IncludeProfiles -and $k -eq "profiles") { $toCopy += $k }
  elseif ($k -eq "sales") { $toCopy += $k }
}

if ($toCopy.Count -eq 0) {
  Write-Host "Подходящих ключей не найдено. Проверь вывод 'wrangler kv key list'." -ForegroundColor Yellow
  exit
}

foreach ($key in $toCopy) {
  # Ремап схемы графика: schedule:YYYY-MM  ->  schedule:sg:YYYY-MM
  $target = $key
  if ($key -match '^schedule:(\d{4}-\d{2})$') { $target = "schedule:sg:$($Matches[1])" }

  if (-not $Apply) {
    Write-Host "[dry] $key  ->  $target"
    continue
  }

  Write-Host "Копирую $key -> $target ..." -ForegroundColor Green
  $val = npx wrangler kv key get $key --namespace-id $OLD --remote | Out-String
  $val = $val.TrimEnd("`r","`n")
  [System.IO.File]::WriteAllText($tmp, $val, $utf8)
  npx wrangler kv key put $target --namespace-id $NEW --remote --path $tmp | Out-Null
}

if (Test-Path $tmp) { Remove-Item $tmp -Force }
if ($Apply) { Write-Host "Готово. Скопировано ключей: $($toCopy.Count)" -ForegroundColor Cyan }
else { Write-Host "`nЭто был сухой прогон. Для реального копирования запусти:  .\migrate-kv.ps1 -Apply" -ForegroundColor Yellow }
