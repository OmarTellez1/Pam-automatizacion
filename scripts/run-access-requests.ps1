param(
    [string]$Date,
    [string]$StartTime,
    [ValidateSet('S', 'N')]
    [string]$Email,
    [switch]$Execute,
    [switch]$Headed
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$envPath = Join-Path $projectDirectory '.env'
$entryPoint = Join-Path $projectDirectory 'src\request-access.mjs'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Falta $envPath. Configure las credenciales desde INICIAR_INTERFAZ.cmd."
}

try {
    $env:BI_HEADED = $Headed.IsPresent.ToString().ToLowerInvariant()

    $arguments = @($entryPoint)
    if ($Date) { $arguments += @('--date', $Date) }
    if ($StartTime) { $arguments += @('--time', $StartTime) }
    if ($Email) { $arguments += @('--email', $Email) }
    if ($Execute) { $arguments += '--execute' }
    if ($Headed) { $arguments += '--headed' }

    & $nodeExecutable @arguments
    $automationExitCode = $LASTEXITCODE
    if ($automationExitCode -ne 0) { exit $automationExitCode }

    if ($Execute) {
        $resultPath = Join-Path $projectDirectory 'run-results\last-run.json'
        if (-not (Test-Path -LiteralPath $resultPath)) {
            throw "No se encontró el resultado esperado: $resultPath"
        }
        $result = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
        $requestIds = @($result.requestIds)
        if ($requestIds.Count -ne 14) {
            throw "Se esperaban 14 Request ID; se encontraron $($requestIds.Count)."
        }

        if ([bool]$result.sendEmail) {
            & (Join-Path $PSScriptRoot 'run-outlook-classic.ps1') -Send
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        else {
            Write-Host 'Los Request ID están disponibles en la interfaz web local.'
        }
    }
    else {
        Write-Host 'Modo de prueba: no se envió correo ni se publicó un resultado web.'
    }
    exit 0
}
finally {
    Remove-Item Env:BI_HEADED -ErrorAction SilentlyContinue
}
