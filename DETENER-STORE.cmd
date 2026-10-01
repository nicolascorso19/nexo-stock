@echo off
setlocal
set "PORT=4100"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Deteniendo proceso %%P del puerto %PORT%...
  taskkill /PID %%P /F >nul 2>&1
)

if "%FOUND%"=="0" (
  echo NEXO Store no esta ejecutandose en el puerto %PORT%.
) else (
  echo NEXO Store detenido.
)

timeout /t 2 /nobreak >nul
exit /b 0
