[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $projectDirectory 'state'
$configPath = Join-Path $stateDirectory 'outlook-config.json'

function Read-RequiredValue {
    param([Parameter(Mandatory)][string]$Prompt)

    do {
        $value = (Read-Host $Prompt).Trim()
        if (-not $value) { Write-Host 'Este valor es obligatorio.' -ForegroundColor Yellow }
    } while (-not $value)
    return $value
}

$tenantId = Read-RequiredValue 'Directory (tenant) ID'
$clientId = Read-RequiredValue 'Application (client) ID'
$sender = Read-RequiredValue 'Cuenta de Outlook que enviará'
$recipientInput = (Read-Host 'Destinatario de prueba [tellezoe@hitss.com]').Trim()
$recipient = if ($recipientInput) { $recipientInput } else { 'tellezoe@hitss.com' }

$guidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
if ($tenantId -notmatch $guidPattern) { throw 'Directory (tenant) ID no es un GUID válido.' }
if ($clientId -notmatch $guidPattern) { throw 'Application (client) ID no es un GUID válido.' }
if ($sender -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'La cuenta remitente no es válida.' }
if ($recipient -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'El destinatario no es válido.' }

$config = [ordered]@{
    tenantId = $tenantId
    clientId = $clientId
    sender = $sender
    recipient = $recipient
    subject = 'ACCESOS AL PAM'
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "Configuración guardada en $configPath"
Write-Host 'Siguiente paso: .\scripts\run-outlook-auth.ps1'
