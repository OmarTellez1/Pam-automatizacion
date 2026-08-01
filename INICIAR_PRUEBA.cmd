@echo off
setlocal
cd /d "%~dp0"

title Prueba de solicitudes BeyondInsight
echo Esta prueba arma y valida una solicitud, pero no la envia.
echo La opcion de correo se valida, pero no envia ni abre resultados.
echo Presione Ctrl+C para cancelar la automatizacion.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-access-requests.ps1" -Headed
set "AUTOMATION_EXIT_CODE=%ERRORLEVEL%"

if "%AUTOMATION_EXIT_CODE%"=="130" exit /b 130

echo.
if not "%AUTOMATION_EXIT_CODE%"=="0" echo La prueba termino con un error. Revise el mensaje anterior.
if "%AUTOMATION_EXIT_CODE%"=="0" echo Prueba finalizada. No se enviaron solicitudes.
echo.
pause
exit /b %AUTOMATION_EXIT_CODE%
