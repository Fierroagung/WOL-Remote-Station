@echo off
title Expo Server - WOL Remote Station (Port 8081)
cd /d "%~dp0"
echo ==========================================================
echo   Menjalankan Expo Development Server WOL Remote Station
echo   Lokasi: %~dp0
echo   Port  : 8081
echo ==========================================================
node node_modules\expo\bin\cli start -g --port 8081
pause
