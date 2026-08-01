$ErrorActionPreference = 'Stop'

Write-Host 'La configuración de credenciales ahora se realiza desde la interfaz local.'
& (Join-Path $PSScriptRoot 'run-local-interface.ps1')
exit $LASTEXITCODE
