$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    if (-not (Test-Path -LiteralPath 'data/.writer.lock')) {
        Write-Host 'EngLive khong co tien trinh duoc ghi nhan.'
        exit 0
    }
    $englivePid = [int](Get-Content -LiteralPath 'data/.writer.lock')
    $engliveProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$englivePid"
    if (-not $engliveProcess) { Write-Host 'EngLive da dung.'; exit 0 }
    if ($engliveProcess.Name -ne 'node.exe' -or $engliveProcess.CommandLine -notmatch '(server\.js|scripts[\\/]start-cloud\.js)') {
        throw 'Tien trinh khong khop EngLive. Khong dung tien trinh nay.'
    }
    Stop-Process -Id $englivePid
    Write-Host 'Da dung website EngLive. 9Router van chay rieng.' -ForegroundColor Green
    Write-Host 'Mo MO-HE-THONG.cmd de chay lai.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
