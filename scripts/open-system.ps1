$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$Host.UI.RawUI.WindowTitle = 'EngLive - LiveKit Cloud + AI'

function Test-LocalPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(700)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

try {
    Write-Host '=== EngLive - LiveKit Cloud + AI ===' -ForegroundColor Cyan
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Chua co Node.js trong PATH.' }
    if (-not (Test-Path -LiteralPath 'data/cloud.env')) { throw 'Thieu data/cloud.env. Can dien cau hinh LiveKit va AI.' }
    if (-not (Test-Path -LiteralPath 'node_modules/express')) { throw 'Chua cai thu vien. Hay chay npm ci trong thu muc du an.' }
    if (Test-LocalPort 3000) {
        Write-Host 'Cong 3000 dang duoc su dung. Neu EngLive dang chay, mo http://localhost:3000.' -ForegroundColor Yellow
        Write-Host 'Muon chay lai trong cua so nay: chay DUNG-HE-THONG.cmd, sau do mo lai MO-HE-THONG.cmd.'
        exit 0
    }
    if (-not (Test-LocalPort 20128)) {
        $router = Join-Path $env:APPDATA 'npm/node_modules/9router/cli.js'
        if (Test-Path -LiteralPath $router) {
            Write-Host 'Dang bat 9Router...'
            Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + $router + '"'), '--no-browser', '--skip-update', '--tray', '--host', '127.0.0.1' -WindowStyle Hidden -RedirectStandardOutput (Join-Path (Get-Location).Path 'data/9router.log') -RedirectStandardError (Join-Path (Get-Location).Path 'data/9router-error.log') | Out-Null
            for ($i = 0; $i -lt 30; $i++) {
                if (Test-LocalPort 20128) { break }
                Start-Sleep -Seconds 1
            }
        }
        if (-not (Test-LocalPort 20128)) { Write-Host '9Router chua san sang. Mo 9Router thu cong de dung AI.' -ForegroundColor Yellow }
    }
    Write-Host 'Website: http://localhost:3000' -ForegroundColor Green
    Write-Host 'Admin:   http://localhost:3000/admin.html'
    Write-Host 'Cau hinh va khoa: data/cloud.env (tu dong nap, khong can copy lai).'
    Write-Host 'Nhan Ctrl+C de dung website. 9Router tiep tuc chay rieng.'
    Write-Host ''
    & npm.cmd run start:cloud
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
