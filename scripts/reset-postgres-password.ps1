param([switch]$RestoreOnly)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$clusterDir = 'C:\Program Files\PostgreSQL\18\data'
$pgCtl = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
$authFile = Join-Path $clusterDir 'pg_hba.conf'
$backupFile = Join-Path $clusterDir 'pg_hba.conf.englive-reset-backup'
$statusFile = Join-Path $projectDir 'data\postgres-reset-status.json'
function Reload-Auth {
  & $pgCtl reload -D $clusterDir | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not reload PostgreSQL authentication configuration.' }
}
function Restore-Auth {
  if (Test-Path -LiteralPath $backupFile) {
    [IO.File]::WriteAllBytes($authFile, [IO.File]::ReadAllBytes($backupFile))
    Reload-Auth
    Remove-Item -LiteralPath $backupFile
  }
}
if ($RestoreOnly) {
  # Crash watchdog: restore original authentication if the interactive window dies.
  Start-Sleep -Seconds 30
  Restore-Auth
  exit
}
Set-Location -LiteralPath $projectDir
$host.UI.RawUI.WindowTitle = 'EngLive - Dat mat khau PostgreSQL moi'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open this script as Administrator.' }
if (Test-Path -LiteralPath $backupFile) { Restore-Auth; throw 'Recovered an interrupted reset. Run again to choose a new password.' }
New-Item -ItemType Directory -Force -Path (Split-Path $statusFile -Parent) | Out-Null
Set-Content -LiteralPath $statusFile -Value '{"stage":"awaiting_password"}' -Encoding ASCII
Write-Host 'Dat mat khau MOI cho tai khoan postgres (it nhat 12 ky tu).'
Write-Host 'Khong gui mat khau vao chat. Khong dong cua so trong khi dang xu ly.'
$first = Read-Host 'Mat khau moi' -AsSecureString
$second = Read-Host 'Nhap lai mat khau moi' -AsSecureString
$ptr1 = [IntPtr]::Zero; $ptr2 = [IntPtr]::Zero
$priorReset = $env:ENGLIVE_RESET_PASSWORD
$priorPassword = $env:PGPASSWORD
$priorHost = $env:PGHOST; $priorPort = $env:PGPORT; $priorUser = $env:PGUSER
try {
  $ptr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
  $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
  $newPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr1)
  if ($newPassword.Length -lt 12 -or $newPassword -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)) { throw 'Passwords must match and have at least 12 characters. Authentication was not changed.' }
  $original = [IO.File]::ReadAllBytes($authFile)
  [IO.File]::WriteAllBytes($backupFile,$original)
  $watchdogArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-RestoreOnly')
  Start-Process -FilePath powershell.exe -ArgumentList $watchdogArgs -WindowStyle Hidden -WorkingDirectory $projectDir | Out-Null
  try {
    # Only this local postgres-to-postgres connection is temporarily allowed.
    $prefix = [Text.Encoding]::ASCII.GetBytes("host postgres postgres 127.0.0.1/32 trust`r`n")
    [IO.File]::WriteAllBytes($authFile, [byte[]]($prefix + $original))
    Reload-Auth
    Start-Sleep -Seconds 1
    $env:ENGLIVE_RESET_PASSWORD = $newPassword
    & node (Join-Path $PSScriptRoot 'reset-postgres-password.js') reset
    if ($LASTEXITCODE -ne 0) { throw 'Password reset failed.' }
  } finally { Restore-Auth }
  Start-Sleep -Seconds 1
  & node (Join-Path $PSScriptRoot 'reset-postgres-password.js') verify
  if ($LASTEXITCODE -ne 0) { throw 'New password could not be verified after restoring authentication.' }
  Write-Host 'Da dat lai va xac minh mat khau. Cau hinh xac thuc ban dau da duoc khoi phuc.'
  Set-Content -LiteralPath $statusFile -Value '{"stage":"password_reset_verified"}' -Encoding ASCII
  $env:PGHOST='127.0.0.1'; $env:PGPORT='5432'; $env:PGUSER='postgres'; $env:PGPASSWORD=$newPassword
  & node (Join-Path $PSScriptRoot 'database.js') setup
  if ($LASTEXITCODE -ne 0) { throw 'Password reset succeeded, but EngLive database setup needs checking.' }
  $config = Join-Path $projectDir 'data\postgres.local.json'
  & icacls.exe $config /inheritance:r /grant:r ($identity.Name + ':(F)') 'SYSTEM:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the app configuration file permissions.' }
  Set-Content -LiteralPath $statusFile -Value '{"stage":"database_ready"}' -Encoding ASCII
  Write-Host 'Database englive da tao. Co the dong cua so nay. Web van dung JSON cho den khi chuyen backend.'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'Dung npm run db:status de kiem tra. Khong gui mat khau vao chat.'
} finally {
  $env:ENGLIVE_RESET_PASSWORD=$priorReset; $env:PGPASSWORD=$priorPassword
  $env:PGHOST=$priorHost; $env:PGPORT=$priorPort; $env:PGUSER=$priorUser
  $newPassword=$null
  if ($ptr1 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr1) }
  if ($ptr2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2) }
}
