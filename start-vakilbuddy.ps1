# Starts the whole project and opens it in a new browser window:
#   Docker Desktop + the caselaw-pg database, the case-law API (8090), the eCourts sample service (8080) and the workspace (4173).
# Run it by double-clicking the "VakilBuddy" desktop shortcut, or:  powershell -ExecutionPolicy Bypass -File start-vakilbuddy.ps1
# The database password is not in this file. It comes from the PGPASSWORD environment variable or from a line
# PGPASSWORD=... in the git-ignored file .env next to this script.

$ErrorActionPreference = 'Continue'     # docker writes harmless warnings to stderr; check exit codes instead
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root '.logs'
New-Item -ItemType Directory -Force $log | Out-Null

function Say($m) { Write-Host ("[VakilBuddy] " + $m) }
function PortUp($p) { [bool](Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
function WaitFor($what, [scriptblock]$test, $seconds) {
    for ($i = 0; $i -lt $seconds; $i += 2) { if (& $test) { return $true }; Start-Sleep 2 }
    Say "gave up waiting for $what"; return $false
}

# --- password -------------------------------------------------------------------------------------------------------
if (-not $env:PGPASSWORD) {
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) { if ($line -match '^\s*PGPASSWORD\s*=\s*(.+?)\s*$') { $env:PGPASSWORD = $Matches[1] } }
    }
}
if (-not $env:PGPASSWORD) { Say "PGPASSWORD is not set: the case-law search will not work (put PGPASSWORD=... in $root\.env)" }

# --- database -------------------------------------------------------------------------------------------------------
$dockerOk = $false
& docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
if (-not $dockerOk) {
    Say 'starting Docker Desktop (this takes up to a minute)'
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    $dockerOk = WaitFor 'Docker' { & docker info *> $null; $LASTEXITCODE -eq 0 } 180
}
if ($dockerOk) {
    Say 'starting the database container'
    & docker start caselaw-pg *> $null
    WaitFor 'the database' { PortUp 5433 } 60 | Out-Null
} else {
    Say 'Docker did not start: case-law search will show the sample catalogue. If Docker shows an error, quit it and run this again.'
}

# --- servers --------------------------------------------------------------------------------------------------------
$node = (Get-Command node -ErrorAction Stop).Source
$servers = @(
    @{ name = 'case-law API';    port = 8090; dir = 'caselaw-db\api';   args = @('server.js') },
    @{ name = 'eCourts service'; port = 8080; dir = 'ecourts-service'; args = @('src\server.js') },
    @{ name = 'workspace';       port = 4173; dir = 'lawyerai';        args = @('server.mjs') }
)
foreach ($s in $servers) {
    if (PortUp $s.port) { Say ($s.name + ' already running'); continue }
    Say ('starting ' + $s.name)
    $tag = ($s.name -replace '\W', '')
    Start-Process $node -ArgumentList $s.args -WorkingDirectory (Join-Path $root $s.dir) -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $log "$tag.out.log") -RedirectStandardError (Join-Path $log "$tag.err.log")
}
foreach ($s in $servers) { WaitFor $s.name { PortUp $s.port } 40 | Out-Null }

# --- browser, in a new window ---------------------------------------------------------------------------------------
$url = 'http://localhost:4173/'
$browsers = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) { Start-Process $exe -ArgumentList '--new-window', $url } else { Start-Process $url }
Say "open at $url"
