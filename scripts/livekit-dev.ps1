# Tải (một lần) và chạy máy chủ LiveKit ở chế độ phát triển trên máy này: npm run livekit:dev
# - Tải bản phát hành chính thức từ github.com/livekit/livekit, đối chiếu SHA-256 với checksums.txt do chính bản phát hành đó cung cấp.
# - Chạy `livekit-server --dev` (khoá devkey/secret, chỉ lắng nghe 127.0.0.1 nên chỉ dùng trên chính máy này).
# - Muốn cho máy khác vào thử cần LiveKit công khai (LiveKit Cloud hoặc máy chủ riêng), xem README.
param([switch]$DownloadOnly, [string]$Version = '1.13.11')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'tools\livekit'
$exe = Join-Path $dir 'livekit-server.exe'
$base = "https://github.com/livekit/livekit/releases/download/v$Version"
$zipName = "livekit_${Version}_windows_amd64.zip"

if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  $zip = Join-Path $dir $zipName
  Write-Host "Đang tải $zipName (~19 MB) từ $base ..."
  Invoke-WebRequest -Uri "$base/$zipName" -OutFile $zip -UseBasicParsing
  $sums = (Invoke-WebRequest -Uri "$base/checksums.txt" -UseBasicParsing).Content
  if ($sums -is [byte[]]) { $sums = [System.Text.Encoding]::UTF8.GetString($sums) } # GitHub trả về dạng byte
  $expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($zipName) } | Select-Object -First 1) -replace '\s+.*$', ''
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if (-not $expected -or $expected.Trim().ToLower() -ne $actual) { Remove-Item $zip -Force; throw "Mã băm SHA-256 không khớp (mong đợi '$expected', thực tế '$actual'). Đã xoá tệp tải về." }
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Remove-Item $zip -Force
  Write-Host "Đã tải và xác minh LiveKit $Version."
}
if ($DownloadOnly) { Write-Host "Tệp chạy: $exe"; exit 0 }
Write-Host 'Chạy LiveKit dev tại ws://localhost:7880 (Ctrl+C để dừng). Mở terminal khác và chạy: npm run start:lk'
& $exe --dev --bind 127.0.0.1
