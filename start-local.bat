@echo off
setlocal
cd /d "%~dp0"

echo.
echo =============================================
echo  HQ Reader 3.2 - frontend + API local
echo =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" copy ".env.example" ".env" >nul
  echo AVISO: .env foi criado a partir do exemplo.
  echo Configure as chaves do Supabase e, para scan completo, GOOGLE_DRIVE_API_KEY.
  echo.
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto :fail
)

echo Frontend: http://localhost:5173
echo API:      http://127.0.0.1:8788
echo.
echo IMPORTANTE: deixe esta janela aberta.
echo.
call npm run dev
exit /b %errorlevel%

:fail
echo.
echo Falha ao preparar o HQ Reader.
pause
exit /b 1
