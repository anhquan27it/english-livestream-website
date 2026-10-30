$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$chatterboxCommit = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'
$env:UV_CACHE_DIR = Join-Path (Get-Location).Path 'data/chatterbox/uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path (Get-Location).Path 'data/chatterbox/python'
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Can cai uv truoc: https://docs.astral.sh/uv/getting-started/installation/' }
& uv python install 3.11
if ($LASTEXITCODE -ne 0) { throw 'Khong cai duoc Python 3.11.' }
if (-not (Test-Path -LiteralPath 'data/chatterbox/venv/Scripts/python.exe')) {
    & uv venv --python 3.11 data/chatterbox/venv
    if ($LASTEXITCODE -ne 0) { throw 'Khong tao duoc moi truong Python.' }
}
if (-not (Test-Path -LiteralPath 'data/chatterbox/source/.git')) {
    & git clone https://github.com/resemble-ai/chatterbox.git data/chatterbox/source
    if ($LASTEXITCODE -ne 0) { throw 'Khong tai duoc ma nguon Chatterbox.' }
}
$currentCommit = & git -C data/chatterbox/source rev-parse HEAD
if ($currentCommit -ne $chatterboxCommit) {
    $localChanges = & git -C data/chatterbox/source status --porcelain
    if ($localChanges) { throw 'Ma nguon Chatterbox co sua doi cuc bo. Khong ghi de.' }
    & git -C data/chatterbox/source fetch --depth 1 origin $chatterboxCommit
    if ($LASTEXITCODE -ne 0) { throw 'Khong tai duoc phien ban Chatterbox da chot.' }
    & git -C data/chatterbox/source checkout --detach $chatterboxCommit
    if ($LASTEXITCODE -ne 0) { throw 'Khong chon duoc phien ban Chatterbox.' }
}
& uv pip install --python data/chatterbox/venv/Scripts/python.exe torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu126
if ($LASTEXITCODE -ne 0) { throw 'Khong cai duoc PyTorch CUDA.' }
& uv pip install --python data/chatterbox/venv/Scripts/python.exe --override scripts/chatterbox-constraints.txt ./data/chatterbox/source
if ($LASTEXITCODE -ne 0) { throw 'Khong cai duoc Chatterbox.' }
& data/chatterbox/venv/Scripts/python.exe scripts/prepare-chatterbox.py nano
if ($LASTEXITCODE -ne 0) { throw 'Khong tai duoc trong so Chatterbox.' }
& uv pip freeze --python data/chatterbox/venv/Scripts/python.exe | Out-File -LiteralPath data/chatterbox/packages.txt -Encoding utf8
Write-Host 'Chatterbox da san sang. Khoi dong lai EngLive va Ctrl+F5.' -ForegroundColor Green
