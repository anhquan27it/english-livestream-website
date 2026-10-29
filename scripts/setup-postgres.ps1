param([string]$DatabaseHost = '127.0.0.1', [int]$DatabasePort = 5432)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir
$probe = New-Object System.Net.Sockets.TcpClient
try {
  if (-not $probe.ConnectAsync($DatabaseHost, $DatabasePort).Wait(3000) -or -not $probe.Connected) { throw 'PostgreSQL is not listening.' }
} catch {
  Write-Output "PostgreSQL chua mo cong $DatabasePort. Hoan tat bo cai, chon PostgreSQL Server + Command Line Tools, roi bat dich vu postgresql-x64-18 trong services.msc."
  exit 1
} finally { $probe.Dispose() }
$prior = @{}
foreach ($key in @('PGHOST','PGPORT','PGUSER','PGPASSWORD')) { $prior[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
$passwordBuffer = [IntPtr]::Zero
try {
  $env:PGHOST = $DatabaseHost; $env:PGPORT = [string]$DatabasePort; $env:PGUSER = 'postgres'
  if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'data\postgres.local.json'))) {
    $secret = Read-Host 'Nhap mat khau postgres da dat khi cai (khong gui vao chat)' -AsSecureString
    $passwordBuffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBuffer)
  }
  & node (Join-Path $PSScriptRoot 'database.js') setup
  if ($LASTEXITCODE -ne 0) { throw 'Setup chua thanh cong. Khong co thao tac doi du lieu web.' }
  $config = Join-Path $projectDir 'data\postgres.local.json'
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $config /inheritance:r /grant:r "${identity}:(F)" 'SYSTEM:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Khong dat duoc quyen tep cau hinh. Kiem tra ACL truoc khi tiep tuc.' }
  & node (Join-Path $PSScriptRoot 'database.js') status
} finally {
  if ($passwordBuffer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBuffer) }
  foreach ($key in $prior.Keys) { [Environment]::SetEnvironmentVariable($key,$prior[$key],'Process') }
}
