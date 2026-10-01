@echo off
setlocal
cd /d "%~dp0"
title NEXO Store

set "NODE_EXE=%LOCALAPPDATA%\NEXO Stock\runtime\node.exe"
if not exist "%NODE_EXE%" (
  for /f "delims=" %%I in ('where node.exe 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :node_found
  )
  echo No se encontro Node.js.
  pause
  exit /b 1
)

:node_found
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue) { Start-Process 'http://127.0.0.1:4100'; exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo NEXO Store ya estaba funcionando. Abriendo el navegador...
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

echo.
echo ============================================
echo   NEXO Store
echo   Abriendo http://127.0.0.1:4100
echo   El stock privado debe estar en :3000
echo   Para detener el servidor: Ctrl+C
echo ============================================
echo.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4100'"
"%NODE_EXE%" "src\index.js"
echo.
echo El servidor se detuvo. Codigo de salida: %ERRORLEVEL%
pause
