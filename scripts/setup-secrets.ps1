$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $projectDirectory 'state'
$configPath = Join-Path $stateDirectory 'config.json'
$passwordPath = Join-Path $stateDirectory 'password.dpapi'
$totpPath = Join-Path $stateDirectory 'totp.dpapi'

New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null

$username = Read-Host 'Usuario de BeyondInsight'
$loginTo = Read-Host 'Valor de "Log in to" (déjelo vacío para usar el predeterminado)'
$password = Read-Host 'Contraseña de BeyondInsight' -AsSecureString
$totpSecret = Read-Host 'Clave Base32 de enrolamiento TOTP (no el código de 6 dígitos)' -AsSecureString

if ([string]::IsNullOrWhiteSpace($username)) {
    throw 'El usuario es obligatorio.'
}

@{
    username = $username.Trim()
    loginTo = $loginTo.Trim()
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

$password | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordPath -Encoding ASCII
$totpSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $totpPath -Encoding ASCII

Write-Host 'Configuración cifrada para la cuenta actual de Windows.'
Write-Host 'Los secretos no se mostraron ni se guardaron como texto plano.'

