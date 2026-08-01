@echo off
setlocal
cd /d "%~dp0"

title Automatizacion real de solicitudes BeyondInsight
echo ATENCION: este flujo creara las 14 solicitudes reales.
echo Si responde S, enviara el correo mediante Outlook clasico.
echo Si responde N, abrira los Request ID en el Bloc de notas.
echo Presione Ctrl+C para cancelar la automatizacion.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-access-requests.ps1" -Execute
set "AUTOMATION_EXIT_CODE=%ERRORLEVEL%"

if "%AUTOMATION_EXIT_CODE%"=="130" exit /b 130

echo.
if not "%AUTOMATION_EXIT_CODE%"=="0" echo La automatizacion termino con un error. Revise el mensaje anterior.
if "%AUTOMATION_EXIT_CODE%"=="0" echo Automatizacion finalizada correctamente.
echo.
pause
exit /b %AUTOMATION_EXIT_CODE%
