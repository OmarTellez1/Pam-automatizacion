@echo off
setlocal
cd /d "%~dp0"

title Prueba completa de solicitudes BeyondInsight
echo Esta prueba arma y descarta una solicitud para cada cuenta de Favorites.
echo No presiona Submit Request. Al final usa los Request ID simulados configurados.
echo La accion final se tomara del toggle guardado en la interfaz local.
echo Presione Ctrl+C para cancelar la automatizacion.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-access-requests.ps1" -TestRun -Headed
set "AUTOMATION_EXIT_CODE=%ERRORLEVEL%"

if "%AUTOMATION_EXIT_CODE%"=="130" exit /b 130

echo.
if not "%AUTOMATION_EXIT_CODE%"=="0" echo La prueba termino con un error. Revise el mensaje anterior.
if "%AUTOMATION_EXIT_CODE%"=="0" echo Prueba finalizada. No se enviaron solicitudes al PAM.
echo.
pause
exit /b %AUTOMATION_EXIT_CODE%
