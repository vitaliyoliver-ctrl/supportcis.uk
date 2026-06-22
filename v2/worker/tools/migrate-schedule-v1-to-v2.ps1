# Перенос АКТУАЛЬНОГО графика из v1 (SCHEDULE_KV) в KV формата v2 (AUTH_KV).
# Только график: overrides + settings + version + log, для проектов SG и НК.
# Профили/роли НЕ трогает. Можно запускать повторно — обновляет график свежими
# данными со старого сайта (перезаписывает соответствующие месяцы в v2).
#
# По умолчанию — сухой прогон (только показывает, что будет). Для записи: -Apply
#
#   .\migrate-schedule-v1-to-v2.ps1 -SchedKv <v1_SCHEDULE_KV> -TargetKv <v2_AUTH_KV>
#   .\migrate-schedule-v1-to-v2.ps1 -SchedKv <v1_SCHEDULE_KV> -TargetKv <v2_AUTH_KV> -Apply
param(
  [Parameter(Mandatory=$true)][string]$SchedKv,
  [Parameter(Mandatory=$true)][string]$TargetKv,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

# UTF-8, чтобы кириллица в заметках/логе не билась
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tmp = Join-Path $PWD "migrate-sched-tmp.json"

function KvGet($nsId, $key) {
  $bytes = & npx wrangler kv key get $key --namespace-id $nsId --remote 2>$null
  if ($bytes -is [array]) { $raw = $bytes -join "" } else { $raw = [string]$bytes }
  return $raw.TrimEnd("`r","`n")
}

function KvPut($nsId, $key, $value) {
  [System.IO.File]::WriteAllText($tmp, $value, $utf8NoBom)
  npx wrangler kv key put $key --namespace-id $nsId --remote --path $tmp | Out-Null
}

# settings-<proj> (v1) -> JSON формата v2 (customHours сливается в employeeOverrides.hours)
function Get-SettingsJson($schedKv, $proj) {
  $raw = KvGet $schedKv "settings-$proj"
  if ([string]::IsNullOrWhiteSpace($raw)) { return "{}" }
  $settings = $raw | ConvertFrom-Json
  $newSettings = @{
    customOrder       = $settings.customOrder
    dismissed         = $settings.dismissed
    operatorPatterns  = $settings.operatorPatterns
    employeeOverrides = $settings.employeeOverrides
  }
  if ($settings.customHours) {
    foreach ($prop in $settings.customHours.PSObject.Properties) {
      $name  = $prop.Name
      $hours = $prop.Value
      if (-not $newSettings.employeeOverrides) { $newSettings.employeeOverrides = @{} }
      if (-not $newSettings.employeeOverrides.$name) {
        $newSettings.employeeOverrides.$name = @{ hours = $hours }
      } elseif ($null -eq $newSettings.employeeOverrides.$name.hours) {
        $newSettings.employeeOverrides.$name | Add-Member -NotePropertyName hours -NotePropertyValue $hours -Force
      }
    }
  }
  return ($newSettings | ConvertTo-Json -Depth 20 -Compress)
}

Write-Host "Reading SCHEDULE_KV key list..."
$allKeys = (npx wrangler kv key list --namespace-id $SchedKv --remote 2>$null | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name }

$total = 0
foreach ($proj in @('sg','nk')) {
  $months = $allKeys | Where-Object { $_ -match "^schedule-$proj`:(\d{4}-\d{2})$" }
  Write-Host ""
  Write-Host "=== Проект $($proj.ToUpper()): $($months.Count) месяцев ==="
  if (-not $months) { continue }

  $settingsJson = Get-SettingsJson $SchedKv $proj

  foreach ($key in $months) {
    $key -match "^schedule-$proj`:(\d{4}-\d{2})$" | Out-Null
    $ym     = $Matches[1]
    $newKey = "schedule:$proj`:$ym"

    if (-not $Apply) {
      Write-Host "  [dry] $key  ->  $newKey"
      continue
    }

    Write-Host "  $key -> $newKey"
    $blob = (KvGet $SchedKv $key) | ConvertFrom-Json
    $verRaw = if ($null -ne $blob.version) { [long]$blob.version } else { 0 }

    # overrides — объект (возможно пустой); log — массив (возможно пустой).
    # Собираем JSON вручную, сохраняя исходные строки (кириллица в заметках/логе).
    $ovJson = $blob.overrides | ConvertTo-Json -Depth 20 -Compress
    if ([string]::IsNullOrWhiteSpace($ovJson)) { $ovJson = "{}" }

    $logArr = @($blob.log)
    if ($logArr.Count -eq 0) {
      $logJson = "[]"
    } elseif ($logArr.Count -eq 1) {
      $logJson = "[" + ($logArr[0] | ConvertTo-Json -Depth 10 -Compress) + "]"
    } else {
      $logJson = $logArr | ConvertTo-Json -Depth 10 -Compress
    }

    $merged = "{""overrides"":" + $ovJson +
              ",""settings"":"  + $settingsJson +
              ",""version"":"   + $verRaw +
              ",""log"":"       + $logJson + "}"
    KvPut $TargetKv $newKey $merged
    $total++
  }
}

if (Test-Path $tmp) { Remove-Item $tmp -Force }

Write-Host ""
if ($Apply) {
  Write-Host "Готово. Перенесено месяцев: $total"
} else {
  Write-Host "Сухой прогон. Для записи добавь -Apply"
}
