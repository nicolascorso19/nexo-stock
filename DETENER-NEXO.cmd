@echo off
setlocal
set "PORT=3000"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Deteniendo proceso %%P del puerto %PORT%...
  taskkill /PID %%P /F >nul 2>&1
)

if "%FOUND%"=="0" (
  echo NEXO Stock no esta ejecutandose en el puerto %PORT%.
) else (
  echo NEXO Stock detenido.
)

timeout /t 2 /nobreak >nul
exit /b 0
