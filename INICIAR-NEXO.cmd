@echo off
setlocal
cd /d "%~dp0"
title NEXO Stock

set "NODE_EXE=%LOCALAPPDATA%\NEXO Stock\runtime\node.exe"
if not exist "%NODE_EXE%" (
  for /f "delims=" %%I in ('where node.exe 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :node_found
  )
  echo.
  echo No se encontro Node.js.
  echo Reinstala NEXO o ejecutalo desde una terminal con Node.js 20.11 o superior.
  pause
  exit /b 1
)

:node_found
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { Start-Process 'http://localhost:3000'; exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo NEXO Stock ya estaba funcionando. Abriendo el navegador...
  exit /b 0
)

if not exist "node_modules\express" (
  echo.
  echo Faltan las dependencias. Instalando...
  call "%NODE_EXE%" "%LOCALAPPDATA%\NEXO Stock\runtime\node_modules\npm\bin\npm-cli.js" install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

set "NODE_ENV=development"
set "HOST=127.0.0.1"
set "PORT=3000"
set "COOKIE_SECURE=false"
set "SEED_DEMO=true"

echo.
echo ============================================
echo   NEXO Stock
echo   Abriendo http://localhost:3000
echo   Para detener el servidor: Ctrl+C
echo ============================================
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
"%NODE_EXE%" "server\index.js"

echo.
echo El servidor se detuvo. Codigo de salida: %ERRORLEVEL%
pause
