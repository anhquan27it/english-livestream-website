param(
  [ValidateSet('Start', 'Status', 'Stop', 'Install', 'Uninstall')]
  [string]$Action = 'Status',
  [switch]$Background,
  [switch]$Manual
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectDir 'data\tunnel'
$linkFile = Join-Path $runtimeDir 'link.txt'
$stopFile = Join-Path $runtimeDir 'stop'
$sharedLinkFile = Join-Path $projectDir 'LINK-WEB.txt'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutFile = Join-Path $startupDir 'EngLive Quick Tunnel.lnk'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Start-Background {
  Start-Process -FilePath $powershellExe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Action', 'Start') -WorkingDirectory $projectDir -WindowStyle Hidden | Out-Null
}
if ($Action -eq 'Install') {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutFile)
  $shortcut.TargetPath = $powershellExe
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Start'
  $shortcut.WorkingDirectory = $projectDir
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Start EngLive and a free temporary HTTPS tunnel after Windows sign-in.'
  $shortcut.Save()
  Write-Output "Installed Windows sign-in startup: $shortcutFile"
  exit
}
if ($Action -eq 'Uninstall') {
  if (Test-Path -LiteralPath $shortcutFile) { Remove-Item -LiteralPath $shortcutFile }
  Write-Output 'Automatic startup removed. Use -Action Stop to stop the current tunnel.'
  exit
}
if ($Action -eq 'Stop') {
  Set-Content -LiteralPath $stopFile -Value 'stop' -Encoding ASCII
  Write-Output 'Stop requested. The launcher will stop its tunnel and any web server it started. An existing web server is preserved.'
  exit
}
if ($Action -eq 'Status') {
  if (Test-Path -LiteralPath $linkFile) { Get-Content -LiteralPath $linkFile }
  else { Write-Output "No active link yet. Check $runtimeDir\launcher.log and cloudflared-error.log" }
  exit
}
if ($Background) { Start-Background; exit }

# One launcher per Windows session. Repeated startup does not create more tunnels.
$mutex = New-Object System.Threading.Mutex($false, 'Local\EngLiveQuickTunnel')
$ownsMutex = $false
$webProcess = $null
$tunnelProcess = $null
function Log([string]$message) {
  Add-Content -LiteralPath (Join-Path $runtimeDir 'launcher.log') -Value ((Get-Date -Format s) + ' ' + $message)
}
function Web-Ready {
  try {
    $result = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/healthz' -TimeoutSec 3
    return $result.ok -eq $true
  } catch { return $false }
}
try {
  try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { if ($Manual) { Write-Host 'Cloudflare da co cua so dang chay. Xem LINK-WEB.txt hoac cua so do.' }; exit }
  if ($Manual) { Set-Content -LiteralPath $sharedLinkFile -Value 'Dang tao link Cloudflare. Giu cua so MO-LINK-WEB.cmd mo va doi ket noi.' -Encoding UTF8 }
  if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
  if (Test-Path -LiteralPath $linkFile) { Remove-Item -LiteralPath $linkFile }
  $cloudflaredExe = (Get-Command cloudflared.exe -ErrorAction Stop).Source
  $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
  Log 'Starting. Public demo credentials must be removed before sharing broadly.'
  while (-not (Test-Path -LiteralPath $stopFile)) {
    if (-not (Web-Ready)) {
      if ($Manual) {
        Write-Host 'EngLive chua chay. Hay mo PowerShell khac, chay npm start, roi thu lai.'
        break
      }
      # Do not start against an occupied port, even if that service is not healthy.
      $probe = New-Object System.Net.Sockets.TcpClient
      $occupied = $false
      try { $occupied = $probe.ConnectAsync('127.0.0.1', 3000).Wait(1000) -and $probe.Connected } catch {} finally { $probe.Dispose() }
      if ($occupied) { Log 'Port 3000 is occupied but /healthz is not ready. Waiting; no existing process is stopped.'; Start-Sleep -Seconds 5; continue }
      if (-not $webProcess -or $webProcess.HasExited) {
        $env:PORT = '3000'
        $webProcess = Start-Process -FilePath $nodeExe -ArgumentList @(('"' + (Join-Path $projectDir 'server.js') + '"')) -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'web-output.log') -RedirectStandardError (Join-Path $runtimeDir 'web-error.log') -PassThru
        Log ('Started web server PID ' + $webProcess.Id)
      }
      Start-Sleep -Seconds 3
      continue
    }
    $errorLog = Join-Path $runtimeDir 'cloudflared-error.log'
    $tunnelProcess = Start-Process -FilePath $cloudflaredExe -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3000', '--no-autoupdate') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'cloudflared-output.log') -RedirectStandardError $errorLog -PassThru
    Log ('Started tunnel PID ' + $tunnelProcess.Id)
    while (-not $tunnelProcess.HasExited -and -not (Test-Path -LiteralPath $stopFile)) {
      if (-not (Test-Path -LiteralPath $linkFile) -and (Test-Path -LiteralPath $errorLog)) {
        $logText = Get-Content -LiteralPath $errorLog -Raw -ErrorAction SilentlyContinue
        if ($logText -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
          $publicUrl = $Matches[0]
          Set-Content -LiteralPath $linkFile -Value $publicUrl -Encoding ASCII
          Set-Content -LiteralPath (Join-Path $runtimeDir 'Open EngLive.url') -Value @('[InternetShortcut]', ('URL=' + $publicUrl)) -Encoding ASCII
          Log ('Public URL: ' + $publicUrl)
          if ($Manual) {
            Set-Content -LiteralPath $sharedLinkFile -Value @($publicUrl, '', ('Created: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')), 'Link hoat dong khi cua so Cloudflare nay con mo va EngLive dang chay.', 'Moi lan tao lai tunnel se co link moi.') -Encoding UTF8
            Write-Host ''
            Write-Host ('LINK WEB: ' + $publicUrl) -ForegroundColor Green
            Write-Host ('Da luu link vao: ' + $sharedLinkFile)
            Write-Host 'Giu cua so nay mo. Bam Ctrl+C de dung chia se.'
          }
        }
      }
      Start-Sleep -Seconds 2
    }
    if (Test-Path -LiteralPath $linkFile) { Remove-Item -LiteralPath $linkFile }
    if ($Manual -and (Test-Path -LiteralPath $sharedLinkFile)) { Set-Content -LiteralPath $sharedLinkFile -Value 'Tunnel da dung / dang ket noi lai. Xem cua so Cloudflare de lay link moi.' -Encoding UTF8 }
    if (-not (Test-Path -LiteralPath $stopFile)) { Log 'Tunnel exited; retrying in 10 seconds. The next link may change.'; Start-Sleep -Seconds 10 }
  }
} catch { Log ('Launcher error: ' + $_.Exception.Message); throw }
finally {
  if ($ownsMutex) {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue }
    if ($webProcess -and -not $webProcess.HasExited) { Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue }
    foreach ($file in @($linkFile, (Join-Path $runtimeDir 'Open EngLive.url'))) {
      if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Log 'Stopped.'
    if ($Manual -and (Test-Path -LiteralPath $sharedLinkFile)) { Set-Content -LiteralPath $sharedLinkFile -Value 'Tunnel da tat. Bam file MO-LINK-WEB.cmd de tao link moi (EngLive phai chay truoc).' -Encoding UTF8 }
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
