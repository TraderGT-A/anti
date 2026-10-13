# watch_rsdash.ps1 - checks that rsdash is really serving data (not just the HTML page).
# Runs from Windows Task Scheduler, costs no tokens. Alerts (Windows toast + log) only on state change:
#   2 consecutive failures -> "DOWN" alert, first success after that -> "RECOVERED" notice.
# Use -Simulate to force a failure (tests the alert path without touching the site).
param([switch]$Simulate)

$base = 'https://rsdashclean.vercel.app'
$dir = Join-Path $env:LOCALAPPDATA 'rsdash_watch'
$logFile = Join-Path $dir 'log.txt'
$stateFile = Join-Path $dir 'state.json'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

# path -> text the body must contain ('' = only status 200 required)
$checks = @(
  @{ p = '/';                                                        must = 'RS Dashboard' },
  @{ p = '/api/scan?universe=leaders';                               must = '"picks"' },
  @{ p = '/api/chart?market=thailand&symbol=PTT&interval=1d&range=1y'; must = '"data"' },
  @{ p = '/api/market-breadth';                                      must = '"markets"' },
  @{ p = '/api/breadth?market=thailand&days=30';                     must = '"history"' },
  @{ p = '/vol_th.json';                                             must = '' }
)

function Log($m) { Add-Content -Path $logFile -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m) }

function Toast($title, $body) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $t = $tpl.GetElementsByTagName('text')
    $t.Item(0).AppendChild($tpl.CreateTextNode($title)) | Out-Null
    $t.Item(1).AppendChild($tpl.CreateTextNode($body)) | Out-Null
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($tpl))
  } catch { Log ('toast failed: ' + $_.Exception.Message) }
}

$fails = @()
foreach ($c in $checks) {
  try {
    $r = Invoke-WebRequest -Uri ($base + $c.p) -UseBasicParsing -TimeoutSec 45
    if ($r.StatusCode -ne 200) { $fails += "$($c.p) -> $($r.StatusCode)" }
    elseif ($c.must -ne '' -and $r.Content -notlike ('*' + $c.must + '*')) { $fails += "$($c.p) -> 200 but body missing $($c.must)" }
  } catch {
    $code = 0; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $fails += "$($c.p) -> ERR $code"
  }
}
if ($Simulate) { $fails += 'SIMULATED failure' }

$state = @{ status = 'ok'; failCount = 0 }
if (Test-Path $stateFile) { try { $state = Get-Content $stateFile -Raw | ConvertFrom-Json } catch {} }
$prevStatus = $state.status; $prevCount = [int]$state.failCount

if ($fails.Count -gt 0) {
  $count = $prevCount + 1
  Log ("FAIL #$count : " + ($fails -join ' | '))
  if ($count -eq 2 -and $prevStatus -ne 'down') {
    Toast 'rsdash is DOWN' ($fails[0] + '  (+' + ($fails.Count - 1) + ' more). See ' + $logFile)
    $newStatus = 'down'
  } else { $newStatus = if ($prevStatus -eq 'down') { 'down' } else { 'ok' } }
  @{ status = $newStatus; failCount = $count } | ConvertTo-Json | Set-Content $stateFile
} else {
  if ($prevStatus -eq 'down') { Log 'RECOVERED'; Toast 'rsdash recovered' 'All checks pass again.' }
  else { Log 'ok' }
  @{ status = 'ok'; failCount = 0 } | ConvertTo-Json | Set-Content $stateFile
}
