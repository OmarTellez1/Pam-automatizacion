@echo off
setlocal
cd /d "%~dp0"

title Interfaz local de Accesos PAM
echo Iniciando la interfaz local de Accesos PAM...
echo Esta ventana debe permanecer abierta mientras use la aplicacion.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local-interface.ps1"
set "PAM_UI_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%PAM_UI_EXIT_CODE%"=="0" echo La interfaz termino con un error. Revise el mensaje anterior.
pause
exit /b %PAM_UI_EXIT_CODE%
