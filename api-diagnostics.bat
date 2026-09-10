@echo off
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo  HQ Reader 3.2 - diagnostico da API local
echo =============================================
echo.
node scripts\doctor-api.js
echo.
pause
