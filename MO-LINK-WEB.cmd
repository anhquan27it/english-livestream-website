@echo off
cd /d "%~dp0"
title EngLive - Cloudflare
echo EngLive: chia se web qua Cloudflare mien phi.
echo Can chay npm start trong mot cua so khac truoc.
echo Link se hien o day va trong LINK-WEB.txt cung thu muc.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tunnel.ps1" -Action Start -Manual
echo.
echo Cloudflare da dung. Cua so npm start cua ban van duoc giu nguyen.
pause
