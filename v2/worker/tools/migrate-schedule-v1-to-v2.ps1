# Migrate the CURRENT schedule from v1 (SCHEDULE_KV) into v2-format KV (AUTH_KV).
# Schedule only: overrides + settings + version + log, for projects SG and NK.
# Does NOT touch profiles/roles. Safe to re-run (refreshes the months in v2 with
# the latest data from the old site).
#
# Dry-run by default (prints what would happen). Use -Apply to write.
#
#   .\migrate-schedule-v1-to-v2.ps1 -SchedKv <v1_SCHEDULE_KV> -TargetKv <v2_AUTH_KV>
#   .\migrate-schedule-v1-to-v2.ps1 -SchedKv <v1_SCHEDULE_KV> -TargetKv <v2_AUTH_KV> -Apply
#
# ASCII-only on purpose: avoids cp1251/UTF-8 parse issues in Windows PowerShell.
param(
  [Parameter(Mandatory=$true)][string]$SchedKv,
  [Parameter(Mandatory=$true)][string]$TargetKv,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
# Don't let a single wrangler stderr line / transient non-zero exit abort the
# whole run (PowerShell 7.3+ makes native commands honor ErrorActionPreference).
$PSNativeCommandUseErrorActionPreference = $false

# Force UTF-8 so Cyrillic inside KV values (notes/log) is preserved on write.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tmp = Join-Path $PWD "migrate-sched-tmp.json"

# Run a wrangler command with retries; returns stdout as a single string.
function Invoke-Wr($wrArgs, $retries = 4) {
  for ($i = 1; $i -le $retries; $i++) {
    $global:LASTEXITCODE = 0
    $out = & npx wrangler @wrArgs 2>$null | Out-String
    if ($LASTEXITCODE -eq 0) { return $out }
    if ($i -lt $retries) { Start-Sleep -Seconds ($i * 2) }
  }
  throw "wrangler failed after $retries tries: wrangler $($wrArgs -join ' ')"
}

function KvGet($nsId, $key) {
  $raw = Invoke-Wr @('kv','key','get',$key,'--namespace-id',$nsId,'--remote')
  return $raw.TrimEnd("`r","`n")
}

function KvPut($nsId, $key, $value) {
  [System.IO.File]::WriteAllText($tmp, $value, $utf8NoBom)
  Invoke-Wr @('kv','key','put',$key,'--namespace-id',$nsId,'--remote','--path',$tmp) | Out-Null
}

# v1 settings-<proj> -> v2 settings JSON (merge customHours into employeeOverrides.hours)
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
$allKeys = (Invoke-Wr @('kv','key','list','--namespace-id',$SchedKv,'--remote') | ConvertFrom-Json) | ForEach-Object { $_.name }

$total = 0
foreach ($proj in @('sg','nk')) {
  $months = $allKeys | Where-Object { $_ -match "^schedule-${proj}:(\d{4}-\d{2})$" }
  Write-Host ""
  Write-Host "=== Project $($proj.ToUpper()): $($months.Count) month(s) ==="
  if (-not $months) { continue }

  $settingsJson = Get-SettingsJson $SchedKv $proj

  foreach ($key in $months) {
    $key -match "^schedule-${proj}:(\d{4}-\d{2})$" | Out-Null
    $ym     = $Matches[1]
    $newKey = "schedule:${proj}:$ym"

    if (-not $Apply) {
      Write-Host "  [dry] $key  ->  $newKey"
      continue
    }

    Write-Host "  $key -> $newKey"
    $blob = (KvGet $SchedKv $key) | ConvertFrom-Json
    $verRaw = if ($null -ne $blob.version) { [long]$blob.version } else { 0 }

    # overrides = object (maybe empty); log = array (maybe empty). Build JSON by
    # hand to keep original strings (Cyrillic in notes/log) intact.
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
  Write-Host "Done. Months migrated: $total"
} else {
  Write-Host "Dry run. Add -Apply to write."
}
