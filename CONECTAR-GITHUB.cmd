@echo off
REM Conecta esta maquina con tu cuenta de GitHub.
REM Doble clic en este archivo y seguí las instrucciones que aparecen.
setlocal
cd /d "%~dp0"

set "GH=%LOCALAPPDATA%\Programs\GitHub CLI\bin\gh.exe"
if not exist "%GH%" (
  echo.
  echo   No se encontro GitHub CLI.
  echo   Avisale al asistente y lo instala de nuevo.
  echo.
  pause
  exit /b 1
)

echo.
echo   === Conectando con GitHub ===
echo.
echo   Vas a ver un codigo de una sola vez. Copialo, pegalo en la
echo   pagina que se abre, autoriza y volve aca.
echo.
"%GH%" auth login --web --hostname github.com --git-protocol https --skip-ssh-key
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo   Listo. Ya estas conectado con GitHub.
) else (
  echo   No se pudo completar la conexion. Volve a intentarlo o
  echo   avisale al asistente.
)
echo.
pause
