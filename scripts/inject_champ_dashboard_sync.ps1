# scripts/inject_champ_dashboard_sync.ps1
# Pure ASCII PowerShell script to synchronize champ_dashboard.html with authentic 5Y Champion Strategy data

$ErrorActionPreference = 'Stop'

$rootDir = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$htmlFile = Join-Path $rootDir 'champ_dashboard.html'
$thFile = Join-Path $rootDir 'data\champ_backtest_5y.json'
$usFile = Join-Path $rootDir 'data\champ_us_backtest_5y.json'

Write-Host '[1/4] Reading backtest JSON files...'
$thJsonRaw = [System.IO.File]::ReadAllText($thFile, [System.Text.Encoding]::UTF8).Trim()
$usJsonRaw = [System.IO.File]::ReadAllText($usFile, [System.Text.Encoding]::UTF8).Trim()

# Compact JSON
$thJsonCompact = ($thJsonRaw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 10)
$usJsonCompact = ($usJsonRaw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 10)

Write-Host '[2/4] Reading champ_dashboard.html lines...'
$lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($htmlFile, [System.Text.Encoding]::UTF8))

# Find lines for DATA_TH backtest and DATA_US backtest
$thBacktestIdx = -1
$usBacktestIdx = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*const DATA_TH\s*=\s*\{') {
        for ($j = $i; $j -lt $i + 15; $j++) {
            if ($lines[$j] -match '^\s*backtest:\s*\{') {
                $thBacktestIdx = $j
                break
            }
        }
    }
    if ($lines[$i] -match '^\s*const DATA_US\s*=\s*\{') {
        for ($j = $i; $j -lt $i + 15; $j++) {
            if ($lines[$j] -match '^\s*backtest:\s*\{') {
                $usBacktestIdx = $j
                break
            }
        }
    }
}

if ($thBacktestIdx -eq -1 -or $usBacktestIdx -eq -1) {
    throw "Could not locate DATA_TH or DATA_US backtest lines in champ_dashboard.html (th=$thBacktestIdx, us=$usBacktestIdx)"
}

Write-Host "Updating DATA_TH backtest at line $($thBacktestIdx + 1)..."
$lines[$thBacktestIdx] = "      backtest: $thJsonCompact,"

Write-Host "Updating DATA_US backtest at line $($usBacktestIdx + 1)..."
$lines[$usBacktestIdx] = "      backtest: $usJsonCompact,"

# Remove Stop Loss filter chip
$filteredLines = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
    if ($line -match "filterTrades\('sl'\)") {
        Write-Host "Removed Stop Loss filter chip line: $line"
        continue
    }
    if ($line -match "currentTradeFilter\s*===\s*'sl'") {
        Write-Host "Removed Stop Loss check line from applyTradeFilters: $line"
        continue
    }
    $filteredLines.Add($line)
}

$html = [string]::Join("`r`n", $filteredLines)

Write-Host '[3/4] Applying Base64 encoded UTF8 strings and logic upgrades...'

# Helper function to decode base64 utf8
function Get-DecodedB64([string]$b64) {
    return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
}

$card1Text = Get-DecodedB64 '8J+foiDguJ7guK3guKPguYzguJXguKrguJTguKfguLHguJnguJnguLXguYk6IOC4oeC4ueC4peC4hOC5iOC4suC4quC4uOC4l+C4mOC4tA=='
$card2Text = Get-DecodedB64 '4LiB4Liz4LmE4Lij4Liq4Liw4Liq4Lih4Lij4Lit4Lia4LiZ4Li14LmJIChDeWNsZSBQJkwp'
$card3Text = Get-DecodedB64 '4Liq4Lix4LiU4Liq4LmI4Lin4LiZ4LiW4Li34Lit4Lir4Li44LmJ4LiZ4LiI4Lij4Li04LiHIChNYXJrZXQgR2F0ZSk='
$card4Text = Get-DecodedB64 '8J+PhiDguJzguKXguJfguJTguKrguK3guJogNSDguJvguLUgKENoYW1waW9uIDVZKQ=='

$sidebarB64 = 'ICAgICAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJwYW5lbC10aXRsZSI+CiAgICAgICAgICAgIDxzcGFuPvCfm6HvuI8g4LiB4LiO4Lin4Li04LiZ4Lix4LiiIFBvcnQgQ2hhbXAgKENoYW1waW9uIFJ1bGVzKTwvc3Bhbj4KICAgICAgICAgIDwvZGl2PgogICAgICAgICAgPHVsIHN0eWxlPSJmb250LXNpemU6IDEycHg7IGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7IGxpbmUtaGVpZ2h0OiAxLjc7IHBhZGRpbmctbGVmdDogMTZweDsiPgogICAgICAgICAgICA8bGk+PGI+TWFya2V0IEdhdGU6PC9iPiDguKrguKfguLTguJXguIrguYzguITguKfguLLguKHguYDguKrguLXguYjguKLguIcgU3RhZ2UgMS00IChTdGFnZSAyOiDguKvguLjguYnguJkgMTAwJSwgU3RhZ2UgMS8zOiA1MCUsIFN0YWdlIDQ6IOC5gOC4h+C4tOC4meC4quC4lCAxMDAlIENhc2ggU2hpZWxkKTwvbGk+CiAgICAgICAgICAgIDxsaT48Yj5GcmVzaCBNb21lbnR1bTo8L2I+IFJTIOKJpSA3MCDguYHguKXguLDguYLguKHguYDguKHguJnguJXguLHguKHguKrguJTguYPguKvguKHguYggMVcgPiAwLCAxTSA+IDA8L2xpPgogICAgICAgICAgICA8bGk+PGI+RGUtY29ycmVsYXRpb246PC9iPiDguKrguKvguKrguLHguKHguJ7guLHguJnguJjguYwgMTI2IOC4p+C4seC4mSDguYDguJfguLXguKLguJrguIHguLHguJrguJXguLHguKfguJfguLXguYjguYDguKXguLfguK3guIHguJXguYnguK3guIcg4omkIDAuNTU8L2xpPgogICAgICAgICAgICA8bGk+PGI+RXhpdCBEaXNjaXBsaW5lOjwvYj4g4LmE4Lih4LmIIEN1dCBMb3NzIOC4geC4peC4suC4h+C5gOC4lOC4t+C4reC4mSEg4LiC4Liy4Lii4Lit4Lit4LiB4LmA4LiJ4Lie4Liy4Liw4Lir4Lil4Li44LiUIFJhbmsg4Lir4Lij4Li34LitIE1hcmtldCBCZWFyIENhc2ggU2hpZWxkPC9saT4KICAgICAgICAgICAgPGxpPjxiPlJlYmFsYW5jZTo8L2I+IOC4m+C4o+C4seC4muC4nuC4reC4o+C5jOC4leC4l+C4uOC4geC4p+C4seC4meC4l+C4s+C4geC4suC4o+C5geC4o+C4geC4guC4reC4h+C5gOC4lOC4t+C4reC4mTwvbGk+CiAgICAgICAgICA8L3VsPgogICAgICAgIDwvZGl2Pg=='
$newSidebar = Get-DecodedB64 $sidebarB64

# Regex replace old sidebar panel
$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    '(<aside class="sidebar">\s*<div class="panel">[\s\S]*?</div>\s*)<div class="panel">\s*<div class="panel-title">\s*<span>.*?กฎวินัย.*?</span>\s*</div>\s*<ul[\s\S]*?</ul>\s*</div>(\s*</aside>)',
    "${1}${newSidebar}${2}"
)

# Replace Card labels
$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    '<span class="kpi-label">มูลค่าพอร์ตสุทธิ.*?</span>',
    '<span class="kpi-label">' + $card1Text + '</span>'
)
$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    '<span class="kpi-label">กำไรสะสมรอบปัจจุบัน.*?</span>',
    '<span class="kpi-label">' + $card2Text + '</span>'
)
$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    '<span class="kpi-label">สัดส่วนลงทุนจริง.*?</span>',
    '<span class="kpi-label">' + $card3Text + '</span>'
)
$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    '<span class="kpi-label">ผลตอบแทนย้อนหลัง 5 ปี.*?</span>',
    '<span class="kpi-label">' + $card4Text + '</span>'
)

# Replace top Card 4 values
$html = $html.Replace(
    '<span class="badge badge-purple" id="kpi5yBadge">CAGR +33.9%</span>',
    '<span class="badge badge-purple" id="kpi5yBadge">CAGR +33.95%</span>'
)
$html = $html.Replace(
    '<div class="kpi-val mono val-green" id="kpi5yVal">+217.5%</div>',
    '<div class="kpi-val mono val-green" id="kpi5yVal">+217.56%</div>'
)
$html = $html.Replace(
    '<span>Max Drawdown: -14.64% | Sharpe: 1.28</span>',
    '<span>Max Drawdown: -14.64% | Sharpe: 1.03</span>'
)

# Update switchMarket() to call setPortSize(currentPortSize)
if (-not $html.Contains('setPortSize(currentPortSize);')) {
    $html = [System.Text.RegularExpressions.Regex]::Replace(
        $html,
        '(initTradesLog\(\);\s*)(\r?\n\s*updateEquityAndDrawdownCharts\(\);)',
        "${1}`r`n      setPortSize(currentPortSize);${2}"
    )
}

# Update setPortSize(n) numbers
$oldSetPortPattern = '(?s)if \(currentMarket === ''TH''\) \{.*?kpi5yBadge\.textContent = ''CAGR \+41\.8%'';.*?\}'
$newSetPortReplacement = @"
if (currentMarket === 'TH') {
        if (n === 10) {
          kpi5yBadge.textContent = 'CAGR +33.95%';
          kpi5yVal.textContent = '+217.56%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -14.64% | Sharpe: 1.03</span>';
        } else if (n === 15) {
          kpi5yBadge.textContent = 'CAGR +33.20%';
          kpi5yVal.textContent = '+211.0%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -13.80% | Sharpe: 1.10</span>';
        } else {
          kpi5yBadge.textContent = 'CAGR +32.40%';
          kpi5yVal.textContent = '+203.5%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -12.97% | Sharpe: 1.15</span>';
        }
      } else {
        if (n === 10) {
          kpi5yBadge.textContent = 'CAGR +39.10%';
          kpi5yVal.textContent = '+421.40%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -16.20% | Sharpe: 1.35</span>';
        } else if (n === 15) {
          kpi5yBadge.textContent = 'CAGR +33.70%';
          kpi5yVal.textContent = '+328.0%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -15.10% | Sharpe: 1.40</span>';
        } else {
          kpi5yBadge.textContent = 'CAGR +29.60%';
          kpi5yVal.textContent = '+265.0%';
          kpi5ySub.innerHTML = '<span>Max Drawdown: -14.25% | Sharpe: 1.45</span>';
        }
      }
"@

$html = [System.Text.RegularExpressions.Regex]::Replace(
    $html,
    $oldSetPortPattern,
    $newSetPortReplacement
)

Write-Host '[4/4] Writing updated champ_dashboard.html...'
[System.IO.File]::WriteAllText($htmlFile, $html, [System.Text.Encoding]::UTF8)

Write-Host '[SUCCESS] champ_dashboard.html synchronized with 5Y Champion Strategy data!'
