@echo off
setlocal
cd /d "%~dp0"

title Abrir sesion autenticada de PAM
echo Abriendo PAM con las credenciales configuradas...
echo Esta ventana se cerrara automaticamente cuando la sesion este lista.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-manual-session.ps1"
exit /b %ERRORLEVEL%
