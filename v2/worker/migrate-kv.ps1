param([switch]$Apply)

$SCHED_KV = "0ebe3fb553fe4abf855ca1124d2bb597"
$OPS_KV   = "2e73bd6374e944ac8b114c777eae15c9"
$NEW_KV   = "e8660703a72b45e69d4e2750a6f88228"

$ErrorActionPreference = "Stop"

# Force UTF-8 so Cyrillic in KV values is not garbled
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tmp = Join-Path $PWD "migrate-tmp.json"

function KvGet($nsId, $key) {
  $bytes = & npx wrangler kv key get $key --namespace-id $nsId --remote 2>$null
  # wrangler may return array of strings; join them
  if ($bytes -is [array]) { $raw = $bytes -join "" } else { $raw = [string]$bytes }
  return $raw.TrimEnd("`r","`n")
}

function KvPut($nsId, $key, $value) {
  [System.IO.File]::WriteAllText($tmp, $value, $utf8NoBom)
  npx wrangler kv key put $key --namespace-id $nsId --remote --path $tmp | Out-Null
}

Write-Host "[1/5] Reading SCHEDULE_KV key list..."
$schedKeys = (npx wrangler kv key list --namespace-id $SCHED_KV --remote 2>$null | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name }

$schedMonths = $schedKeys | Where-Object { $_ -match '^schedule-sg:(\d{4}-\d{2})$' }
$profileKeys = $schedKeys | Where-Object { $_ -match '^profile:' }

Write-Host "[2/5] Reading settings-sg..."
$settingsRaw = KvGet $SCHED_KV "settings-sg"
$settings = $settingsRaw | ConvertFrom-Json

$newSettings = @{
  customOrder       = $settings.customOrder
  dismissed         = $settings.dismissed
  operatorPatterns  = $settings.operatorPatterns
  employeeOverrides = $settings.employeeOverrides
}

# Merge customHours -> employeeOverrides[name].hours
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

$settingsJson = $newSettings | ConvertTo-Json -Depth 20 -Compress
Write-Host "  customOrder sections: $(($settings.customOrder.PSObject.Properties | Measure-Object).Count)"

Write-Host "[3/5] Schedules: $($schedMonths.Count) months"
foreach ($key in $schedMonths) {
  $key -match '^schedule-sg:(\d{4}-\d{2})$' | Out-Null
  $ym     = $Matches[1]
  $newKey = "schedule:sg:$ym"

  if (-not $Apply) {
    Write-Host "  [dry] $key  ->  $newKey"
    continue
  }

  Write-Host "  $key -> $newKey"
  $blobRaw = KvGet $SCHED_KV $key
  $blob = $blobRaw | ConvertFrom-Json

  # Build merged blob preserving original JSON for overrides/log (keeps UTF-8 strings intact)
  $merged = "{""overrides"":" + ($blob.overrides | ConvertTo-Json -Depth 20 -Compress) +
            ",""settings"":" + $settingsJson +
            ",""version"":" + [int]$blob.version +
            ",""log"":" + ($blob.log | ConvertTo-Json -Depth 10 -Compress) + "}"

  KvPut $NEW_KV $newKey $merged
}

Write-Host "[4/5] Profiles: $($profileKeys.Count) keys"
$profilesMap = @{}
foreach ($key in $profileKeys) {
  $email = $key -replace '^profile:', ''
  if (-not $Apply) {
    Write-Host "  [dry] $key  ->  profiles[$email]"
    continue
  }
  Write-Host "  $key"
  $raw = KvGet $SCHED_KV $key
  try { $profilesMap[$email] = $raw | ConvertFrom-Json } catch { $profilesMap[$email] = $raw }
}
if ($Apply -and $profileKeys.Count -gt 0) {
  Write-Host "  Writing profiles..."
  KvPut $NEW_KV "profiles" ($profilesMap | ConvertTo-Json -Depth 10 -Compress)
}

Write-Host "[5/5] Roles..."
if (-not $Apply) {
  Write-Host "  [dry] role-lists (OPS_KV)  ->  roles (AUTH_KV)"
} else {
  Write-Host "  role-lists -> roles"
  $rolesRaw = KvGet $OPS_KV "role-lists"
  KvPut $NEW_KV "roles" $rolesRaw
}

if (Test-Path $tmp) { Remove-Item $tmp -Force }

if ($Apply) {
  Write-Host ""
  Write-Host "Done! $($schedMonths.Count) schedules, $($profileKeys.Count) profiles, 1 roles"
} else {
  Write-Host ""
  Write-Host "Dry run OK. Run:  .\migrate-kv.ps1 -Apply"
}
